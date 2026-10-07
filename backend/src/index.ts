import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { devicesRouter } from './devices';
import { screenTimeRouter } from './screen-time';
import { notificationsRouter } from './notifications';
import { feedbackRouter } from './feedback';

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'focuslock-backend', timestamp: new Date().toISOString() });
});

// Modular Routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/screen-time', screenTimeRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/feedback', feedbackRouter);

app.listen(port, () => {
  console.log(`FocusLock Backend listening on port ${port}`);
});

export default app;
