"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.feedbackRouter = void 0;
const express_1 = require("express");
const email_1 = require("../services/email");
exports.feedbackRouter = (0, express_1.Router)();
/**
 * POST /api/feedback
 * Body: { category, rating, message, replyEmail?, platform?, includeDiagnostics }
 */
exports.feedbackRouter.post('/', async (req, res) => {
    const { category, rating, message, replyEmail, platform, includeDiagnostics } = req.body;
    // Basic validation
    if (!category || typeof rating !== 'number' || !message || message.trim().length < 8) {
        return res.status(400).json({ error: 'Invalid payload. category, rating, and a message (≥8 chars) are required.' });
    }
    const { error } = await (0, email_1.sendFeedbackEmail)({
        userEmail: replyEmail || undefined,
        category,
        rating,
        message,
        platform: platform || undefined,
        includeDiagnostics: !!includeDiagnostics,
    });
    if (error) {
        return res.status(500).json({ error: 'Failed to send feedback email. Please try again.' });
    }
    return res.status(200).json({ ok: true });
});
