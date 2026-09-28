import { Router } from 'express';

export const usersRouter = Router();

// GET /api/users/profile
usersRouter.get('/profile', (req, res) => {
  res.json({
    id: 'placeholder-user-id',
    name: 'Placeholder User',
    email: 'user@waiyatlabs.space',
    role: 'user',
  });
});
