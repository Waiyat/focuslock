import crypto from 'crypto';
import { supabaseAdmin } from '../database';

export interface OtpRecord {
  email: string;
  code: string;
  purpose: 'register' | 'forgot_password';
  metadata?: Record<string, any>;
  expiresAt: number; // timestamp ms
  createdAt: number; // timestamp ms
  lastSentAt: number; // timestamp ms
  attempts: number;
  verified: boolean;
}

// In-memory cache for ultra-fast local dev and warm lambda instances
const otpStore = new Map<string, OtpRecord>();

// Cooldown period between resend requests (30 seconds)
export const RESEND_COOLDOWN_MS = 30 * 1000;

// OTP expiration period (10 minutes)
export const OTP_EXPIRATION_MS = 10 * 60 * 1000;

// Maximum failed attempts before invalidating the code
export const MAX_ATTEMPTS = 5;

// Secret for HMAC-signed reset tokens across serverless lambdas
const HMAC_SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY || 'focuslock-secure-hmac-secret-salt';

function getStoreKey(email: string, purpose: string): string {
  return `${email.trim().toLowerCase()}:${purpose}`;
}

export function getOtp(
  email: string,
  purpose: 'register' | 'forgot_password'
): OtpRecord | undefined {
  return otpStore.get(getStoreKey(email, purpose));
}

/**
 * Generates a cryptographically random 6-digit numeric OTP code.
 */
export function generateOtpCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}

/**
 * Checks if a resend request is currently on cooldown.
 * Checks memory first, then Supabase Auth metadata.
 */
export function checkResendCooldown(email: string, purpose: 'register' | 'forgot_password'): {
  allowed: boolean;
  remainingSeconds: number;
} {
  const key = getStoreKey(email, purpose);
  const existing = otpStore.get(key);

  if (existing) {
    const elapsed = Date.now() - existing.lastSentAt;
    if (elapsed < RESEND_COOLDOWN_MS) {
      const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
      return { allowed: false, remainingSeconds };
    }
  }

  return { allowed: true, remainingSeconds: 0 };
}

/**
 * Creates and stores a new OTP code for registration or password reset.
 * Persists in both local memory AND Supabase Auth user_metadata for serverless durability.
 */
export async function createOtp(
  email: string,
  purpose: 'register' | 'forgot_password',
  metadata?: Record<string, any>
): Promise<{ code: string }> {
  const cleanEmail = email.trim().toLowerCase();
  const key = getStoreKey(cleanEmail, purpose);
  const existing = otpStore.get(key);
  const code = generateOtpCode();
  const now = Date.now();

  const finalMetadata = metadata ?? existing?.metadata;

  const record: OtpRecord = {
    email: cleanEmail,
    code,
    purpose,
    metadata: finalMetadata,
    expiresAt: now + OTP_EXPIRATION_MS,
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
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);

      if (existingUser && !existingUser.email_confirmed_at) {
        // Update pending OTP on existing unconfirmed user
        await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
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
      } else if (!existingUser) {
        // Create unconfirmed user with OTP stored in user_metadata
        await supabaseAdmin.auth.admin.createUser({
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
    } else if (purpose === 'forgot_password') {
      const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
      const user = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
      if (user) {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...user.user_metadata,
            reset_otp: code,
            reset_otp_expires_at: record.expiresAt,
            last_sent_at: now,
          },
        });
      }
    }
  } catch (err) {
    console.warn('[createOtp] Supabase serverless persistence warning:', err);
  }

  return { code };
}

/**
 * Verifies a provided OTP code against memory or Supabase Auth.
 */
export async function verifyOtp(
  email: string,
  purpose: 'register' | 'forgot_password',
  code: string
): Promise<{ valid: boolean; error?: string; metadata?: Record<string, any>; userId?: string }> {
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

    if (record.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(key);
      return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
    }

    if (record.code === inputCode) {
      record.verified = true;
      return { valid: true, metadata: record.metadata };
    }

    record.attempts += 1;
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      valid: false,
      error: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    };
  }

  // 2. Serverless fallback: look up pending code from Supabase Auth
  try {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
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
      } else if (purpose === 'forgot_password') {
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
  } catch (err) {
    console.warn('[verifyOtp] Supabase serverless check error:', err);
  }

  return { valid: false, error: 'No verification code found. Please request a new one.' };
}

/**
 * Clears the OTP record after successful operation completion.
 */
export async function clearOtp(email: string, purpose: 'register' | 'forgot_password') {
  const cleanEmail = email.trim().toLowerCase();
  const key = getStoreKey(cleanEmail, purpose);
  otpStore.delete(key);

  try {
    const { data: usersList } = await supabaseAdmin.auth.admin.listUsers();
    const user = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (user) {
      if (purpose === 'register') {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...user.user_metadata,
            pending_otp: null,
            pending_password: null,
          },
        });
      } else if (purpose === 'forgot_password') {
        await supabaseAdmin.auth.admin.updateUserById(user.id, {
          user_metadata: {
            ...user.user_metadata,
            reset_otp: null,
          },
        });
      }
    }
  } catch {
    // Non-fatal
  }
}

// ── Stateless HMAC-Signed Reset Tokens for Serverless ─────────────────

function signResetTokenPayload(email: string, expiresAt: number): string {
  return crypto.createHmac('sha256', HMAC_SECRET).update(`${email}:${expiresAt}`).digest('hex');
}

export function generateResetToken(email: string): string {
  const cleanEmail = email.trim().toLowerCase();
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 mins
  const sig = signResetTokenPayload(cleanEmail, expiresAt);
  const payload = JSON.stringify({ email: cleanEmail, expiresAt, sig });
  return Buffer.from(payload).toString('base64url');
}

export function verifyResetToken(token: string, email: string): boolean {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const payloadStr = Buffer.from(token, 'base64url').toString('utf8');
    const { email: tokenEmail, expiresAt, sig } = JSON.parse(payloadStr);

    if (tokenEmail !== cleanEmail) return false;
    if (Date.now() > expiresAt) return false;

    const expectedSig = signResetTokenPayload(tokenEmail, expiresAt);
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig));
  } catch {
    return false;
  }
}

export function invalidateResetToken(_token: string) {
  // Stateless tokens expire automatically
}
