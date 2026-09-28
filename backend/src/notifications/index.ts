import { Router } from 'express';

export const notificationsRouter = Router();

// GET /api/notifications/preferences
notificationsRouter.get('/preferences', (req, res) => {
  res.json({
    resetReminderEnabled: true,
    resetReminderMinutesBefore: 20,
    dailyResetEnabled: true,
    limitWarningsEnabled: true,
    limitReachedEnabled: true,
  });
});
