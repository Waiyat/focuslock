import { Router } from 'express';

export const screenTimeRouter = Router();

// GET /api/screen-time/config
screenTimeRouter.get('/config', (req, res) => {
  res.json({
    status: 'ACTIVE',
    configurationVersion: 1,
    resetTime: '08:00',
    timezone: 'UTC',
    limits: [
      { appId: 'com.instagram.android', dailyLimitSeconds: 7200, usedSeconds: 0 },
      { appId: 'com.zhiliaoapp.musically', dailyLimitSeconds: 1800, usedSeconds: 0 },
    ],
  });
});

// POST /api/screen-time/config (allowed only during pre-reset window per README §3.4)
screenTimeRouter.post('/config', (req, res) => {
  res.json({
    message: 'Screen time limits updated for upcoming reset window',
    configuration: req.body,
    version: 2,
  });
});
