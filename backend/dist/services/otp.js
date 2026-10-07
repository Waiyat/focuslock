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
// In-memory cache for ultra-fast, tamper-proof lookups
const otpStore = new Map();
// Cooldown period between resend requests (30 seconds)
exports.RESEND_COOLDOWN_MS = 30 * 1000;
// OTP expiration period (10 minutes)
exports.OTP_EXPIRATION_MS = 10 * 60 * 1000;
// Maximum failed attempts before invalidating the code
exports.MAX_ATTEMPTS = 5;
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
 * Returns { allowed: boolean, remainingSeconds: number }
 */
function checkResendCooldown(email, purpose) {
    const key = getStoreKey(email, purpose);
    const existing = otpStore.get(key);
    if (!existing) {
        return { allowed: true, remainingSeconds: 0 };
    }
    const elapsed = Date.now() - existing.lastSentAt;
    if (elapsed < exports.RESEND_COOLDOWN_MS) {
        const remainingSeconds = Math.ceil((exports.RESEND_COOLDOWN_MS - elapsed) / 1000);
        return { allowed: false, remainingSeconds };
    }
    return { allowed: true, remainingSeconds: 0 };
}
/**
 * Creates and stores a new OTP code for registration or password reset.
 * Automatically preserves existing metadata if a new one is not supplied.
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
    // Attempt non-blocking write to Supabase otp_verifications if table exists
    try {
        await database_1.supabaseAdmin.from('otp_verifications').insert({
            email: cleanEmail,
            code,
            purpose,
            metadata: metadata ?? {},
            expires_at: new Date(record.expiresAt).toISOString(),
            attempts: 0,
            verified: false,
        });
    }
    catch {
        // Non-fatal if table not yet created in Supabase
    }
    return { code };
}
/**
 * Verifies a provided OTP code against the store.
 */
async function verifyOtp(email, purpose, code) {
    const cleanEmail = email.trim().toLowerCase();
    const key = getStoreKey(cleanEmail, purpose);
    const record = otpStore.get(key);
    if (!record) {
        return { valid: false, error: 'No verification code found. Please request a new one.' };
    }
    if (Date.now() > record.expiresAt) {
        otpStore.delete(key);
        return { valid: false, error: 'Verification code has expired. Please request a new code.' };
    }
    if (record.attempts >= exports.MAX_ATTEMPTS) {
        otpStore.delete(key);
        return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
    }
    if (record.code !== code.trim()) {
        record.attempts += 1;
        const remaining = exports.MAX_ATTEMPTS - record.attempts;
        return {
            valid: false,
            error: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
        };
    }
    // Code is valid! Mark verified
    record.verified = true;
    // Non-blocking update to Supabase table
    try {
        await database_1.supabaseAdmin
            .from('otp_verifications')
            .update({ verified: true })
            .eq('email', cleanEmail)
            .eq('purpose', purpose);
    }
    catch {
        // Non-fatal
    }
    return { valid: true, metadata: record.metadata };
}
/**
 * Clears the OTP record after successful operation completion.
 */
function clearOtp(email, purpose) {
    const key = getStoreKey(email, purpose);
    otpStore.delete(key);
}
// In-memory store for verified reset tokens (valid for 15 minutes)
const resetTokens = new Map();
function generateResetToken(email) {
    const token = crypto_1.default.randomBytes(32).toString('hex');
    resetTokens.set(token, {
        email: email.trim().toLowerCase(),
        expiresAt: Date.now() + 15 * 60 * 1000,
    });
    return token;
}
function verifyResetToken(token, email) {
    const record = resetTokens.get(token);
    if (!record)
        return false;
    if (Date.now() > record.expiresAt) {
        resetTokens.delete(token);
        return false;
    }
    return record.email === email.trim().toLowerCase();
}
function invalidateResetToken(token) {
    resetTokens.delete(token);
}
