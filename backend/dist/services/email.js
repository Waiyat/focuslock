"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resend = void 0;
exports.sendRegistrationOtpEmail = sendRegistrationOtpEmail;
exports.sendPasswordResetOtpEmail = sendPasswordResetOtpEmail;
exports.sendFeedbackEmail = sendFeedbackEmail;
const resend_1 = require("resend");
const rawKey = process.env.RESEND_API_KEY || '';
const resendApiKey = rawKey.startsWith('re_') ? rawKey.split('eyJ')[0].trim() : rawKey.trim();
const resendFrom = process.env.RESEND_FROM_EMAIL || 'FocusLock <noreply@support.waiyatlabs.space>';
const feedbackFrom = process.env.RESEND_FEEDBACK_FROM || 'FocusLock Support <contact@support.waiyatlabs.space>';
const feedbackForwardTo = process.env.FEEDBACK_FORWARD_TO || 'bykiptoo@gmail.com';
exports.resend = new resend_1.Resend(resendApiKey);
/**
 * Sends a 6-digit registration verification OTP email.
 * Returns { error: string | null } — callers should check error and return 500 if set.
 */
async function sendRegistrationOtpEmail(email, code, username) {
    const greeting = username ? `Hi <strong>${username}</strong>,` : 'Hello,';
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>FocusLock Verification Code</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    Your FocusLock verification code is ${code}. Complete your account registration.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 500px; background-color: #18181b; border: 1px solid #27272a; border-radius: 20px; padding: 36px 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <span style="font-size: 13px; font-weight: 800; letter-spacing: 3px; color: #a1a1aa; text-transform: uppercase;">FOCUSLOCK</span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 12px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Verify Your Account</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 24px; text-align: center; color: #a1a1aa; font-size: 15px; line-height: 24px;">
              ${greeting} welcome to FocusLock. Use the 6-digit verification code below to complete your registration.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <div style="display: inline-block; background-color: #09090b; border: 2px solid #3b82f6; border-radius: 14px; padding: 16px 36px; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #60a5fa; font-family: monospace;">
                ${code}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 28px; text-align: center; color: #71717a; font-size: 13px; line-height: 20px;">
              This code expires in <strong style="color: #d4d4d8;">10 minutes</strong>.<br>If you did not request this, you can safely ignore this email.
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #27272a; padding-top: 20px; text-align: center; color: #71717a; font-size: 12px; line-height: 18px;">
              WaiyatLabs &bull; FocusLock Discipline Enforcer<br>
              This is an automated security verification message sent to ${email}.<br>
              &copy; ${new Date().getFullYear()} WaiyatLabs. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
    const text = `FOCUSLOCK VERIFICATION CODE

${username ? `Hi ${username},` : 'Hello,'}

Your 6-digit verification code is:

  ${code}

This code expires in 10 minutes. If you did not request this code, you can safely ignore this email.

---
WaiyatLabs • FocusLock Discipline Enforcer
© ${new Date().getFullYear()} WaiyatLabs. All rights reserved.`;
    try {
        const result = await exports.resend.emails.send({
            from: resendFrom,
            to: email,
            replyTo: 'noreply@support.waiyatlabs.space',
            subject: `FocusLock: Your verification code is ${code}`,
            html,
            text,
        });
        if (result.error) {
            const errMsg = result.error?.message || JSON.stringify(result.error);
            console.error(`[Email] ❌ Registration OTP to ${email} failed:`, errMsg);
            return { error: errMsg };
        }
        console.log(`[Email] ✅ Registration OTP sent → ${email} (id: ${result.data?.id})`);
        return { error: null };
    }
    catch (err) {
        const msg = err?.message || String(err);
        console.error(`[Email] ❌ Exception sending registration OTP to ${email}:`, msg);
        return { error: msg };
    }
}
/**
 * Sends a 6-digit password reset OTP email.
 * Returns { error: string | null } — callers should check error and return 500 if set.
 */
async function sendPasswordResetOtpEmail(email, code) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your FocusLock Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #09090b; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f4f4f5;">
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    Your FocusLock password reset code is ${code}. It expires in 10 minutes.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #09090b; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 500px; background-color: #18181b; border: 1px solid #27272a; border-radius: 20px; padding: 36px 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <span style="font-size: 13px; font-weight: 800; letter-spacing: 3px; color: #a1a1aa; text-transform: uppercase;">FOCUSLOCK</span>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 12px; text-align: center;">
              <h1 style="margin: 0; font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Password Reset Code</h1>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 24px; text-align: center; color: #a1a1aa; font-size: 15px; line-height: 24px;">
              We received a request to reset your FocusLock password. Enter the 6-digit code below to set a new password.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <div style="display: inline-block; background-color: #09090b; border: 2px solid #ef4444; border-radius: 14px; padding: 16px 36px; letter-spacing: 8px; font-size: 32px; font-weight: 800; color: #f87171; font-family: monospace;">
                ${code}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding-bottom: 28px; text-align: center; color: #71717a; font-size: 13px; line-height: 20px;">
              This code expires in <strong style="color: #d4d4d8;">10 minutes</strong>.<br>If you did not request a password reset, please secure your account immediately.
            </td>
          </tr>
          <tr>
            <td style="border-top: 1px solid #27272a; padding-top: 20px; text-align: center; color: #71717a; font-size: 12px; line-height: 18px;">
              WaiyatLabs &bull; FocusLock Discipline Enforcer<br>
              This is an automated security verification message sent to ${email}.<br>
              &copy; ${new Date().getFullYear()} WaiyatLabs. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
    const text = `FOCUSLOCK PASSWORD RESET CODE

We received a request to reset your FocusLock password.
Your 6-digit verification code is:

  ${code}

This code expires in 10 minutes. If you did not request a password reset, please secure your account immediately.

---
WaiyatLabs • FocusLock Discipline Enforcer
© ${new Date().getFullYear()} WaiyatLabs. All rights reserved.`;
    try {
        const result = await exports.resend.emails.send({
            from: resendFrom,
            to: email,
            replyTo: 'noreply@support.waiyatlabs.space',
            subject: `FocusLock: Password reset code is ${code}`,
            html,
            text,
        });
        if (result.error) {
            const errMsg = result.error?.message || JSON.stringify(result.error);
            console.error(`[Email] ❌ Password reset OTP to ${email} failed:`, errMsg);
            return { error: errMsg };
        }
        console.log(`[Email] ✅ Password reset OTP sent → ${email} (id: ${result.data?.id})`);
        return { error: null };
    }
    catch (err) {
        const msg = err?.message || String(err);
        console.error(`[Email] ❌ Exception sending password reset OTP to ${email}:`, msg);
        return { error: msg };
    }
}
/**
 * Sends two emails on feedback submission:
 *  1. A thank-you acknowledgement to the user (from noreply@)
 *  2. A forwarded copy with full details to the owner (from contact@)
 */
async function sendFeedbackEmail(params) {
    const { userEmail, category, rating, message, platform, includeDiagnostics } = params;
    const year = new Date().getFullYear();
    const submittedAt = new Date().toLocaleString('en-US', {
        timeZone: 'Africa/Nairobi',
        dateStyle: 'full',
        timeStyle: 'short',
    });
    const ratingStars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
    const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1).replace(/-/g, ' ');
    // ── 1. Thank-you email to the user ──────────────────────────────────────
    if (userEmail) {
        const thankHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thanks for your FocusLock Feedback</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f4f4f5;">
  <div style="display:none;font-size:1px;color:#333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">Thank you for your feedback — we appreciate it and will review every word.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090b;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:500px;background-color:#18181b;border:1px solid #27272a;border-radius:20px;padding:36px 30px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <tr><td align="center" style="padding-bottom:24px;">
          <span style="font-size:13px;font-weight:800;letter-spacing:3px;color:#a1a1aa;text-transform:uppercase;">FOCUSLOCK</span>
        </td></tr>
        <tr><td style="padding-bottom:12px;text-align:center;">
          <h1 style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Thank You! 🙏</h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;text-align:center;color:#a1a1aa;font-size:15px;line-height:24px;">
          We've received your <strong style="color:#d4d4d8;">${categoryLabel}</strong> feedback and truly appreciate you taking the time to share it with us.
          Every submission is personally reviewed by our team and helps us build a better digital wellbeing companion.
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <div style="display:inline-block;background-color:#09090b;border:2px solid #22c55e;border-radius:14px;padding:16px 32px;text-align:center;">
            <div style="font-size:28px;letter-spacing:4px;color:#4ade80;margin-bottom:6px;">${ratingStars}</div>
            <div style="font-size:13px;color:#71717a;">Your rating — ${rating}/5</div>
          </div>
        </td></tr>
        <tr><td style="padding-bottom:28px;text-align:center;color:#71717a;font-size:13px;line-height:20px;">
          If you shared a reply email, our team may follow up. Otherwise, keep an eye on future app updates — your voice is heard.
        </td></tr>
        <tr><td style="border-top:1px solid #27272a;padding-top:20px;text-align:center;color:#71717a;font-size:12px;line-height:18px;">
          WaiyatLabs &bull; FocusLock Discipline Enforcer<br>
          &copy; ${year} WaiyatLabs. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
        const thankText = `FOCUSLOCK — FEEDBACK RECEIVED\n\nThank you for your ${categoryLabel} feedback!\n\nWe've received your submission (${ratingStars} ${rating}/5) and will review it personally.\n\n---\nWaiyatLabs • FocusLock Discipline Enforcer\n© ${year} WaiyatLabs. All rights reserved.`;
        try {
            const r = await exports.resend.emails.send({
                from: resendFrom,
                to: userEmail,
                subject: 'Thanks for your FocusLock feedback!',
                html: thankHtml,
                text: thankText,
            });
            if (r.error) {
                console.error('[Feedback] ❌ Thank-you email failed:', r.error?.message);
            }
            else {
                console.log(`[Feedback] ✅ Thank-you sent → ${userEmail} (id: ${r.data?.id})`);
            }
        }
        catch (err) {
            console.error('[Feedback] ❌ Exception sending thank-you email:', err?.message);
        }
    }
    // ── 2. Forward full feedback details to owner ────────────────────────────
    const diagnosticsSection = includeDiagnostics && platform
        ? `<tr><td style="padding-top:16px;"><p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Device Info</p><p style="margin:0;font-size:14px;color:#d4d4d8;">${platform}</p></td></tr>`
        : '';
    const replySection = userEmail
        ? `<tr><td style="padding-top:16px;"><p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Reply To</p><p style="margin:0;"><a href="mailto:${userEmail}" style="color:#60a5fa;text-decoration:none;font-size:14px;">${userEmail}</a></p></td></tr>`
        : `<tr><td style="padding-top:16px;"><p style="margin:0 0 4px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Reply To</p><p style="margin:0;font-size:14px;color:#71717a;">Anonymous — no email provided</p></td></tr>`;
    const forwardHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New FocusLock Feedback Submission</title>
</head>
<body style="margin:0;padding:0;background-color:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#09090b;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" style="max-width:560px;background-color:#18181b;border:1px solid #27272a;border-radius:20px;padding:36px 30px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <tr><td align="center" style="padding-bottom:20px;">
          <span style="font-size:11px;font-weight:800;letter-spacing:3px;color:#a1a1aa;text-transform:uppercase;">FOCUSLOCK FEEDBACK DASHBOARD</span>
        </td></tr>
        <tr><td style="padding-bottom:8px;">
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">📬 New Feedback Submission</h1>
        </td></tr>
        <tr><td style="padding-bottom:24px;color:#71717a;font-size:13px;">${submittedAt}</td></tr>

        <!-- Category & Rating badges -->
        <tr><td style="padding-bottom:20px;">
          <span style="display:inline-block;background-color:#3b82f620;border:1px solid #3b82f6;border-radius:20px;padding:4px 14px;font-size:13px;font-weight:700;color:#60a5fa;margin-right:8px;">${categoryLabel}</span>
          <span style="display:inline-block;background-color:#f59e0b20;border:1px solid #f59e0b;border-radius:20px;padding:4px 14px;font-size:13px;font-weight:700;color:#fbbf24;">${ratingStars} ${rating}/5</span>
        </td></tr>

        <!-- Message box -->
        <tr><td style="padding-bottom:20px;">
          <p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:1px;">Message</p>
          <div style="background-color:#09090b;border:1px solid #3f3f46;border-radius:10px;padding:16px 18px;font-size:15px;color:#d4d4d8;line-height:24px;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </td></tr>

        <!-- Meta info -->
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #27272a;padding-top:8px;">
          ${replySection}
          ${diagnosticsSection}
        </table>

        <tr><td style="border-top:1px solid #27272a;padding-top:20px;margin-top:24px;text-align:center;color:#71717a;font-size:12px;line-height:18px;">
          FocusLock Internal Feedback Notification &bull; WaiyatLabs<br>
          &copy; ${year} WaiyatLabs. All rights reserved.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
    const forwardText = `NEW FOCUSLOCK FEEDBACK\n\nSubmitted: ${submittedAt}\nCategory: ${categoryLabel}\nRating: ${ratingStars} (${rating}/5)\nReply To: ${userEmail || 'Anonymous'}\n${includeDiagnostics && platform ? `Platform: ${platform}\n` : ''}\nMessage:\n${message}\n\n---\nFocusLock Internal Notification`;
    try {
        const r = await exports.resend.emails.send({
            from: feedbackFrom,
            to: feedbackForwardTo,
            replyTo: userEmail || feedbackFrom,
            subject: `[FocusLock Feedback] ${categoryLabel} · ${ratingStars}`,
            html: forwardHtml,
            text: forwardText,
        });
        if (r.error) {
            const errMsg = r.error?.message || JSON.stringify(r.error);
            console.error('[Feedback] ❌ Forward email failed:', errMsg);
            return { error: errMsg };
        }
        console.log(`[Feedback] ✅ Forwarded → ${feedbackForwardTo} (id: ${r.data?.id})`);
        return { error: null };
    }
    catch (err) {
        const msg = err?.message || String(err);
        console.error('[Feedback] ❌ Exception forwarding feedback:', msg);
        return { error: msg };
    }
}
