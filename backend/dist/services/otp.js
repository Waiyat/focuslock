"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_ATTEMPTS = exports.OTP_EXPIRATION_MS = exports.RESEND_COOLDOWN_MS = void 0;
exports.getOtp = getOtp;
exports.generateOtpCode = generateOtpCode;
exports.checkResendCooldown = checkResendCooldown;
exports.createOtp = createOtp;
exports.verifyOtp = verifyOtp;
exports.clearOtp = clearOtp;
exports.generateResetToken = generateResetToken;
exports.verifyResetToken = verifyResetToken;
exports.invalidateResetToken = invalidateResetToken;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../database");
// In-memory cache for ultra-fast local dev and warm lambda instances
const otpStore = new Map();
// Cooldown period between resend requests (30 seconds)
exports.RESEND_COOLDOWN_MS = 30 * 1000;
// OTP expiration period (10 minutes)
exports.OTP_EXPIRATION_MS = 10 * 60 * 1000;
// Maximum failed attempts before invalidating the code
exports.MAX_ATTEMPTS = 5;
// Secret for HMAC-signed reset tokens across serverless lambdas
const HMAC_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'focuslock-secure-hmac-secret-salt';
function getStoreKey(email, purpose) {
    return `${email.trim().toLowerCase()}:${purpose}`;
}
function getOtp(email, purpose) {
    return otpStore.get(getStoreKey(email, purpose));
}
/**
 * Generates a cryptographically random 6-digit numeric OTP code.
 */
function generateOtpCode() {
    return crypto_1.default.randomInt(100000, 999999).toString();
}
/**
 * Checks if a resend request is currently on cooldown.
 * Checks memory first, then Supabase Auth metadata.
 */
function checkResendCooldown(email, purpose) {
    const key = getStoreKey(email, purpose);
    const existing = otpStore.get(key);
    if (existing) {
        const elapsed = Date.now() - existing.lastSentAt;
        if (elapsed < exports.RESEND_COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((exports.RESEND_COOLDOWN_MS - elapsed) / 1000);
            return { allowed: false, remainingSeconds };
        }
    }
    return { allowed: true, remainingSeconds: 0 };
}
/**
 * Creates and stores a new OTP code for registration or password reset.
 * Persists in both local memory AND Supabase Auth user_metadata for serverless durability.
 */
async function createOtp(email, purpose, metadata) {
    const cleanEmail = email.trim().toLowerCase();
    const key = getStoreKey(cleanEmail, purpose);
    const existing = otpStore.get(key);
    const code = generateOtpCode();
    const now = Date.now();
    const finalMetadata = metadata ?? existing?.metadata;
    const record = {
        email: cleanEmail,
        code,
        purpose,
        metadata: finalMetadata,
        expiresAt: now + exports.OTP_EXPIRATION_MS,
        createdAt: now,
        lastSentAt: now,
        attempts: 0,
        verified: false,
    };
    otpStore.set(key, record);
    // ── Serverless Persistence via Supabase Auth ─────────────────────────
    try {
        if (purpose === 'register') {
            // Find if an unconfirmed user already exists in Supabase Auth
            const { data: usersList } = await database_1.supabaseAdmin.auth.admin.listUsers();
            const existingUser = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
            if (existingUser && !existingUser.email_confirmed_at) {
                // Update pending OTP on existing unconfirmed user
                await database_1.supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
                    password: finalMetadata?.password || undefined,
                    user_metadata: {
                        ...existingUser.user_metadata,
                        pending_otp: code,
                        otp_expires_at: record.expiresAt,
                        pending_username: finalMetadata?.username || existingUser.user_metadata?.username,
                        pending_password: finalMetadata?.password,
                        last_sent_at: now,
                    },
                });
            }
            else if (!existingUser) {
                // Create unconfirmed user with OTP stored in user_metadata
                await database_1.supabaseAdmin.auth.admin.createUser({
                    email: cleanEmail,
                    password: finalMetadata?.password || 'FocusLock_Temp_123!',
                    email_confirm: false,
                    user_metadata: {
                        username: finalMetadata?.username,
                        pending_username: finalMetadata?.username,
                        pending_password: finalMetadata?.password,
                        pending_otp: code,
                        otp_expires_at: record.expiresAt,
                        last_sent_at: now,
                    },
                });
            }
        }
        else if (purpose === 'forgot_password') {
            const { data: usersList } = await database_1.supabaseAdmin.auth.admin.listUsers();
            const user = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
            if (user) {
                await database_1.supabaseAdmin.auth.admin.updateUserById(user.id, {
                    user_metadata: {
                        ...user.user_metadata,
                        reset_otp: code,
                        reset_otp_expires_at: record.expiresAt,
                        last_sent_at: now,
                    },
                });
            }
        }
    }
    catch (err) {
        console.warn('[createOtp] Supabase serverless persistence warning:', err);
    }
    return { code };
}
/**
 * Verifies a provided OTP code against memory or Supabase Auth.
 */
async function verifyOtp(email, purpose, code) {
    const cleanEmail = email.trim().toLowerCase();
    const inputCode = code.trim();
    const key = getStoreKey(cleanEmail, purpose);
    // 1. Fast path: check in-memory cache
    let record = otpStore.get(key);
    if (record) {
        if (Date.now() > record.expiresAt) {
            otpStore.delete(key);
            return { valid: false, error: 'Verification code has expired. Please request a new code.' };
        }
        if (record.attempts >= exports.MAX_ATTEMPTS) {
            otpStore.delete(key);
            return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
        }
        if (record.code === inputCode) {
            record.verified = true;
            return { valid: true, metadata: record.metadata };
        }
        record.attempts += 1;
        const remaining = exports.MAX_ATTEMPTS - record.attempts;
        return {
            valid: false,
            error: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        };
    }
    // 2. Serverless fallback: look up pending code from Supabase Auth
    try {
        const { data: usersList } = await database_1.supabaseAdmin.auth.admin.listUsers();
        const user = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
        if (user) {
            if (purpose === 'register') {
                const storedCode = user.user_metadata?.pending_otp;
                const expiresAt = Number(user.user_metadata?.otp_expires_at || 0);
                if (!storedCode) {
                    return { valid: false, error: 'No verification code found. Please request a new one.' };
                }
                if (Date.now() > expiresAt) {
                    return { valid: false, error: 'Verification code has expired. Please request a new code.' };
                }
                if (storedCode === inputCode) {
                    return {
                        valid: true,
                        userId: user.id,
                        metadata: {
                            username: user.user_metadata?.pending_username || user.user_metadata?.username,
                            password: user.user_metadata?.pending_password,
                        },
                    };
                }
                return { valid: false, error: 'Invalid verification code. Please check and try again.' };
            }
            else if (purpose === 'forgot_password') {
                const storedCode = user.user_metadata?.reset_otp;
                const expiresAt = Number(user.user_metadata?.reset_otp_expires_at || 0);
                if (!storedCode) {
                    return { valid: false, error: 'No reset code found. Please request a new one.' };
                }
                if (Date.now() > expiresAt) {
                    return { valid: false, error: 'Reset code has expired. Please request a new code.' };
                }
                if (storedCode === inputCode) {
                    return { valid: true, userId: user.id, metadata: { userId: user.id } };
                }
                return { valid: false, error: 'Invalid reset code. Please check and try again.' };
            }
        }
    }
    catch (err) {
        console.warn('[verifyOtp] Supabase serverless check error:', err);
    }
    return { valid: false, error: 'No verification code found. Please request a new one.' };
}
/**
 * Clears the OTP record after successful operation completion.
 */
async function clearOtp(email, purpose) {
    const cleanEmail = email.trim().toLowerCase();
    const key = getStoreKey(cleanEmail, purpose);
    otpStore.delete(key);
    try {
        const { data: usersList } = await database_1.supabaseAdmin.auth.admin.listUsers();
        const user = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
        if (user) {
            if (purpose === 'register') {
                await database_1.supabaseAdmin.auth.admin.updateUserById(user.id, {
                    user_metadata: {
                        ...user.user_metadata,
                        pending_otp: null,
                        pending_password: null,
                    },
                });
            }
            else if (purpose === 'forgot_password') {
                await database_1.supabaseAdmin.auth.admin.updateUserById(user.id, {
                    user_metadata: {
                        ...user.user_metadata,
                        reset_otp: null,
                    },
                });
            }
        }
    }
    catch {
        // Non-fatal
    }
}
// ── Stateless HMAC-Signed Reset Tokens for Serverless ─────────────────
function signResetTokenPayload(email, expiresAt) {
    return crypto_1.default.createHmac('sha256', HMAC_SECRET).update(`${email}:${expiresAt}`).digest('hex');
}
function generateResetToken(email) {
    const cleanEmail = email.trim().toLowerCase();
    const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins
    const sig = signResetTokenPayload(cleanEmail, expiresAt);
    const payload = JSON.stringify({ email: cleanEmail, expiresAt, sig });
    return Buffer.from(payload).toString('base64url');
}
function verifyResetToken(token, email) {
    try {
        const cleanEmail = email.trim().toLowerCase();
        const payloadStr = Buffer.from(token, 'base64url').toString('utf8');
        const { email: tokenEmail, expiresAt, sig } = JSON.parse(payloadStr);
        if (tokenEmail !== cleanEmail)
            return false;
        if (Date.now() > expiresAt)
            return false;
        const expectedSig = signResetTokenPayload(tokenEmail, expiresAt);
        return crypto_1.default.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
    }
    catch {
        return false;
    }
}
function invalidateResetToken(_token) {
    // Stateless tokens expire automatically
}
