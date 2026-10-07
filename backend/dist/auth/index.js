"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRouter = void 0;
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
const email_1 = require("../services/email");
const otp_1 = require("../services/otp");
exports.authRouter = (0, express_1.Router)();
// =======================================================================
// 1. REGISTRATION FLOW WITH OTP (Resend)
// =======================================================================
/**
 * POST /api/auth/register-request
 * Step 1: Validates username, email, password, confirmPassword.
 * Checks for duplicate username/email, generates 6-digit OTP, sends via Resend.
 */
exports.authRouter.post('/register-request', async (req, res) => {
    const { username, email, password, confirmPassword } = req.body;
    // 1. Username validation (letters, numbers, underscores, and dots allowed)
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    const cleanUsername = username.trim().toLowerCase();
    if (!/^[a-zA-Z0-9_.]{3,30}$/.test(cleanUsername)) {
        return res.status(400).json({
            error: 'Username can only contain letters, numbers, underscores, and dots (3-30 characters).',
        });
    }
    // 2. Email validation
    if (!email || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'A valid email address is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    // 3. Password validation
    if (!password || typeof password !== 'string' || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (!confirmPassword || password !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match.' });
    }
    // 4. Duplicate checks in Supabase
    const { data: existingProfile } = await database_1.supabaseAdmin
        .from('profiles')
        .select('username')
        .eq('username', cleanUsername)
        .maybeSingle();
    if (existingProfile) {
        return res.status(409).json({ error: 'Username is already taken. Please choose another.' });
    }
    // Check if email already registered in auth.users
    const { data: usersList } = await database_1.supabaseAdmin.auth.admin.listUsers();
    const emailExists = usersList?.users?.some((u) => u.email?.toLowerCase() === cleanEmail);
    if (emailExists) {
        return res.status(409).json({ error: 'An account with this email already exists. Sign in instead.' });
    }
    // 5. Cooldown check (2 minutes)
    const cooldown = (0, otp_1.checkResendCooldown)(cleanEmail, 'register');
    if (!cooldown.allowed) {
        return res.status(429).json({
            error: `Please wait ${cooldown.remainingSeconds} seconds before requesting a new code.`,
            remainingSeconds: cooldown.remainingSeconds,
        });
    }
    // 6. Generate OTP and store pending registration metadata
    const { code } = await (0, otp_1.createOtp)(cleanEmail, 'register', {
        username: cleanUsername,
        password,
    });
    // 7. Send Email via Resend
    try {
        const { error: sendError } = await (0, email_1.sendRegistrationOtpEmail)(cleanEmail, code, cleanUsername);
        if (sendError) {
            console.error('[Resend Error]', sendError);
            return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
        }
    }
    catch (err) {
        console.error('[Resend Exception]', err);
        return res.status(500).json({ error: 'Email service error. Please try again.' });
    }
    return res.status(200).json({
        success: true,
        message: `Verification code has been sent to ${cleanEmail}. Verify to continue.`,
        email: cleanEmail,
        cooldownSeconds: 30,
    });
});
/**
 * POST /api/auth/register-verify
 * Step 2: Validates the 6-digit OTP and creates the account in Supabase.
 */
exports.authRouter.post('/register-verify', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ error: 'Email and verification code are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const verification = await (0, otp_1.verifyOtp)(cleanEmail, 'register', code);
    if (!verification.valid) {
        return res.status(400).json({ error: verification.error || 'Invalid verification code.' });
    }
    const { username, password } = verification.metadata || {};
    if (!username || !password) {
        return res.status(400).json({ error: 'Registration session expired. Please start over.' });
    }
    // Create user in Supabase with verified email
    const { data: newUser, error: createError } = await database_1.supabaseAdmin.auth.admin.createUser({
        email: cleanEmail,
        password,
        user_metadata: {
            username,
            full_name: username,
        },
        email_confirm: true, // confirmed because OTP verified!
    });
    if (createError) {
        console.error('[/register-verify] Supabase create user error:', createError);
        return res.status(400).json({ error: createError.message });
    }
    const userId = newUser.user?.id;
    // Explicitly upsert profile row — guarantees existence even if DB trigger misfires
    if (userId) {
        const { error: profileError } = await database_1.supabaseAdmin.from('profiles').upsert({
            id: userId,
            email: cleanEmail,
            username,
            display_name: username,
            avatar_url: null,
        }, { onConflict: 'id' });
        if (profileError) {
            // Non-fatal — log but don't block the response; user can still sign in
            console.warn('[/register-verify] Profile upsert warning:', profileError.message);
        }
        else {
            console.log(`[/register-verify] ✅ Profile created for ${cleanEmail} (id: ${userId})`);
        }
    }
    // Clean up OTP record
    (0, otp_1.clearOtp)(cleanEmail, 'register');
    return res.status(201).json({
        success: true,
        message: 'Account created and verified successfully.',
        userId,
        email: newUser.user?.email,
        username,
    });
});
/**
 * POST /api/auth/register-resend
 * Resends the 6-digit registration OTP (enforces 30-second cooldown).
 */
exports.authRouter.post('/register-resend', async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res.status(400).json({ error: 'Email is required.' });
    const cleanEmail = email.trim().toLowerCase();
    const cooldown = (0, otp_1.checkResendCooldown)(cleanEmail, 'register');
    if (!cooldown.allowed) {
        return res.status(429).json({
            error: `Please wait ${cooldown.remainingSeconds} seconds before requesting a new code.`,
            remainingSeconds: cooldown.remainingSeconds,
        });
    }
    // Retrieve existing metadata so password/username are not lost
    const existingOtp = (0, otp_1.getOtp)(cleanEmail, 'register');
    const metadata = existingOtp?.metadata;
    // Regenerate OTP with existing metadata
    const { code } = await (0, otp_1.createOtp)(cleanEmail, 'register', metadata);
    const { error: sendError } = await (0, email_1.sendRegistrationOtpEmail)(cleanEmail, code, metadata?.username);
    if (sendError) {
        console.error('[register-resend] Email send failed:', sendError);
        return res.status(500).json({ error: 'Failed to resend verification email. Please try again.' });
    }
    return res.json({
        success: true,
        message: `A new verification code was sent to ${cleanEmail}.`,
        cooldownSeconds: 30,
    });
});
// =======================================================================
// 2. FORGOT PASSWORD FLOW WITH OTP (Resend)
// =======================================================================
/**
 * POST /api/auth/forgot-password-request
 * Step 1: User enters email. Validates user exists, sends 6-digit reset code via Resend.
 */
exports.authRouter.post('/forgot-password-request', async (req, res) => {
    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    // Find user by email in Supabase
    const { data: usersList } = await database_1.supabaseAdmin.auth.admin.listUsers();
    const user = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (!user) {
        // For security, don't leak user existence directly, but inform user code was sent if exists
        return res.status(404).json({ error: 'No account found with this email address.' });
    }
    // Check 2-minute cooldown
    const cooldown = (0, otp_1.checkResendCooldown)(cleanEmail, 'forgot_password');
    if (!cooldown.allowed) {
        return res.status(429).json({
            error: `Please wait ${cooldown.remainingSeconds} seconds before requesting another reset code.`,
            remainingSeconds: cooldown.remainingSeconds,
        });
    }
    // Create reset OTP
    const { code } = await (0, otp_1.createOtp)(cleanEmail, 'forgot_password', { userId: user.id });
    try {
        const { error: sendError } = await (0, email_1.sendPasswordResetOtpEmail)(cleanEmail, code);
        if (sendError) {
            console.error('[Resend Password Reset Error]', sendError);
            return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
        }
    }
    catch (err) {
        return res.status(500).json({ error: 'Email service error. Please try again.' });
    }
    return res.json({
        success: true,
        message: `Reset code has been sent to ${cleanEmail}.`,
        email: cleanEmail,
        cooldownSeconds: 120,
    });
});
/**
 * POST /api/auth/forgot-password-verify
 * Step 2: User enters the 6-digit code. Validates code and issues a secure resetToken.
 */
exports.authRouter.post('/forgot-password-verify', async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ error: 'Email and reset code are required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    const verification = await (0, otp_1.verifyOtp)(cleanEmail, 'forgot_password', code);
    if (!verification.valid) {
        return res.status(400).json({ error: verification.error || 'Invalid reset code.' });
    }
    // Generate secure reset token
    const resetToken = (0, otp_1.generateResetToken)(cleanEmail);
    return res.json({
        success: true,
        message: 'Code verified successfully. You may now enter your new password.',
        resetToken,
    });
});
/**
 * POST /api/auth/forgot-password-resend
 * Resends the 6-digit password reset OTP (enforces 2-minute cooldown).
 */
exports.authRouter.post('/forgot-password-resend', async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res.status(400).json({ error: 'Email is required.' });
    const cleanEmail = email.trim().toLowerCase();
    const cooldown = (0, otp_1.checkResendCooldown)(cleanEmail, 'forgot_password');
    if (!cooldown.allowed) {
        return res.status(429).json({
            error: `Please wait ${cooldown.remainingSeconds} seconds before requesting a new code.`,
            remainingSeconds: cooldown.remainingSeconds,
        });
    }
    const { code } = await (0, otp_1.createOtp)(cleanEmail, 'forgot_password');
    const { error: sendError } = await (0, email_1.sendPasswordResetOtpEmail)(cleanEmail, code);
    if (sendError) {
        console.error('[forgot-password-resend] Email send failed:', sendError);
        return res.status(500).json({ error: 'Failed to resend reset email. Please try again.' });
    }
    return res.json({
        success: true,
        message: `A new reset code was sent to ${cleanEmail}.`,
        cooldownSeconds: 120,
    });
});
/**
 * POST /api/auth/forgot-password-reset
 * Step 3: User submits new password and confirm password with resetToken (or valid code).
 * Updates user password in Supabase via Admin API.
 */
exports.authRouter.post('/forgot-password-reset', async (req, res) => {
    const { email, resetToken, code, newPassword, confirmPassword } = req.body;
    if (!email) {
        return res.status(400).json({ error: 'Email is required.' });
    }
    const cleanEmail = email.trim().toLowerCase();
    // Validate token or fallback to code
    let isAuthorized = false;
    if (resetToken && (0, otp_1.verifyResetToken)(resetToken, cleanEmail)) {
        isAuthorized = true;
    }
    else if (code) {
        const check = await (0, otp_1.verifyOtp)(cleanEmail, 'forgot_password', code);
        if (check.valid)
            isAuthorized = true;
    }
    if (!isAuthorized) {
        return res.status(401).json({
            error: 'Invalid or expired password reset session. Please request a new code.',
        });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }
    if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'Passwords do not match.' });
    }
    // Find user in Supabase
    const { data: usersList } = await database_1.supabaseAdmin.auth.admin.listUsers();
    const user = usersList?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);
    if (!user) {
        return res.status(404).json({ error: 'User account not found.' });
    }
    // Update password in Supabase Admin API
    const { error: updateError } = await database_1.supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: newPassword,
    });
    if (updateError) {
        console.error('[/forgot-password-reset] Supabase error:', updateError);
        return res.status(500).json({ error: updateError.message });
    }
    // Invalidate reset session
    if (resetToken)
        (0, otp_1.invalidateResetToken)(resetToken);
    (0, otp_1.clearOtp)(cleanEmail, 'forgot_password');
    return res.json({
        success: true,
        message: 'Password reset successful! You can now log in with your new password.',
    });
});
// =======================================================================
// 3. UTILITY / SESSION VERIFY & ACCOUNT DELETE
// =======================================================================
/**
 * GET /api/auth/check-username/:username
 * Public: checks whether a username is available.
 */
exports.authRouter.get('/check-username/:username', async (req, res) => {
    const { username } = req.params;
    const cleanUsername = username?.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3) {
        return res.status(400).json({ error: 'Username must be at least 3 characters.' });
    }
    const { data } = await database_1.supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('username', cleanUsername)
        .maybeSingle();
    return res.json({ available: !data });
});
/**
 * GET /api/auth/verify
 * Protected: validates client JWT.
 */
exports.authRouter.get('/verify', auth_1.requireAuth, (req, res) => {
    const user = req.user;
    res.json({
        valid: true,
        userId: user.id,
        email: user.email,
        role: user.role,
    });
});
/**
 * DELETE /api/auth/delete-account
 * Protected: permanently deletes user and all cascade data.
 */
exports.authRouter.delete('/delete-account', auth_1.requireAuth, async (req, res) => {
    const user = req.user;
    const { error } = await database_1.supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) {
        return res.status(500).json({ error: 'Failed to delete account.' });
    }
    res.json({ message: 'Account deleted successfully.' });
});
