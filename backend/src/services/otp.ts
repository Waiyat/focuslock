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

// In-memory cache for ultra-fast, tamper-proof lookups
const otpStore = new Map<string, OtpRecord>();

// Cooldown period between resend requests (30 seconds)
export const RESEND_COOLDOWN_MS = 30 * 1000;

// OTP expiration period (10 minutes)
export const OTP_EXPIRATION_MS = 10 * 60 * 1000;

// Maximum failed attempts before invalidating the code
export const MAX_ATTEMPTS = 5;

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
 * Returns { allowed: boolean, remainingSeconds: number }
 */
export function checkResendCooldown(email: string, purpose: 'register' | 'forgot_password'): {
  allowed: boolean;
  remainingSeconds: number;
} {
  const key = getStoreKey(email, purpose);
  const existing = otpStore.get(key);

  if (!existing) {
    return { allowed: true, remainingSeconds: 0 };
  }

  const elapsed = Date.now() - existing.lastSentAt;
  if (elapsed < RESEND_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    return { allowed: false, remainingSeconds };
  }

  return { allowed: true, remainingSeconds: 0 };
}

/**
 * Creates and stores a new OTP code for registration or password reset.
 * Automatically preserves existing metadata if a new one is not supplied.
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

  // Attempt non-blocking write to Supabase otp_verifications if table exists
  try {
    await supabaseAdmin.from('otp_verifications').insert({
      email: cleanEmail,
      code,
      purpose,
      metadata: metadata ?? {},
      expires_at: new Date(record.expiresAt).toISOString(),
      attempts: 0,
      verified: false,
    });
  } catch {
    // Non-fatal if table not yet created in Supabase
  }

  return { code };
}

/**
 * Verifies a provided OTP code against the store.
 */
export async function verifyOtp(
  email: string,
  purpose: 'register' | 'forgot_password',
  code: string
): Promise<{ valid: boolean; error?: string; metadata?: Record<string, any> }> {
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

  if (record.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, error: 'Too many incorrect attempts. Please request a new code.' };
  }

  if (record.code !== code.trim()) {
    record.attempts += 1;
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      valid: false,
      error: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
    };
  }

  // Code is valid! Mark verified
  record.verified = true;

  // Non-blocking update to Supabase table
  try {
    await supabaseAdmin
      .from('otp_verifications')
      .update({ verified: true })
      .eq('email', cleanEmail)
      .eq('purpose', purpose);
  } catch {
    // Non-fatal
  }

  return { valid: true, metadata: record.metadata };
}

/**
 * Clears the OTP record after successful operation completion.
 */
export function clearOtp(email: string, purpose: 'register' | 'forgot_password') {
  const key = getStoreKey(email, purpose);
  otpStore.delete(key);
}

// In-memory store for verified reset tokens (valid for 15 minutes)
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

export function generateResetToken(email: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  resetTokens.set(token, {
    email: email.trim().toLowerCase(),
    expiresAt: Date.now() + 15 * 60 * 1000,
  });
  return token;
}

export function verifyResetToken(token: string, email: string): boolean {
  const record = resetTokens.get(token);
  if (!record) return false;
  if (Date.now() > record.expiresAt) {
    resetTokens.delete(token);
    return false;
  }
  return record.email === email.trim().toLowerCase();
}

export function invalidateResetToken(token: string) {
  resetTokens.delete(token);
}
