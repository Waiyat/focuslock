import { Router } from 'express';

export const devicesRouter = Router();

// POST /api/devices/register
devicesRouter.post('/register', (req, res) => {
  const { deviceId, platform, model } = req.body;
  res.status(201).json({
    message: 'Device registration placeholder',
    deviceId: deviceId || 'device-uuid-placeholder',
    platform: platform || 'ios',
    model,
    registeredAt: new Date().toISOString(),
  });
});
