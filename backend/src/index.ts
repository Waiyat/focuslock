import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { authRouter } from './auth';
import { usersRouter } from './users';
import { devicesRouter } from './devices';
import { screenTimeRouter } from './screen-time';
import { notificationsRouter } from './notifications';

dotenv.config();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health Check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'focuslock-backend', timestamp: new Date().toISOString() });
});

// Modular Routes per README §18 & §29
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/screen-time', screenTimeRouter);
app.use('/api/notifications', notificationsRouter);

app.listen(port, () => {
  console.log(`FocusLock Backend listening on port ${port}`);
});

export default app;
