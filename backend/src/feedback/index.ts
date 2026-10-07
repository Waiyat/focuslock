import { Router, Request, Response } from 'express';
import { sendFeedbackEmail } from '../services/email';

export const feedbackRouter = Router();

/**
 * POST /api/feedback
 * Body: { category, rating, message, replyEmail?, platform?, includeDiagnostics }
 */
feedbackRouter.post('/', async (req: Request, res: Response) => {
  const { category, rating, message, replyEmail, platform, includeDiagnostics } = req.body;

  // Basic validation
  if (!category || typeof rating !== 'number' || !message || message.trim().length < 8) {
    return res.status(400).json({ error: 'Invalid payload. category, rating, and a message (≥8 chars) are required.' });
  }

  const { error } = await sendFeedbackEmail({
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
