"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationsRouter = void 0;
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
exports.notificationsRouter = (0, express_1.Router)();
exports.notificationsRouter.use(auth_1.requireAuth);
/**
 * GET /api/notifications/preferences
 * Returns notification preferences for the authenticated user.
 */
exports.notificationsRouter.get('/preferences', async (req, res) => {
    const user = req.user;
    const { data, error } = await database_1.supabaseAdmin
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .single();
    if (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({ error: 'Notification preferences not found.' });
        }
        return res.status(500).json({ error: 'Failed to fetch notification preferences.' });
    }
    res.json(data);
});
/**
 * PATCH /api/notifications/preferences
 * Updates notification preferences.
 */
exports.notificationsRouter.patch('/preferences', async (req, res) => {
    const user = req.user;
    const { notifyOnLimitReached, notifyWindowOpening, notifyWindowClosing, quietHoursStart, quietHoursEnd } = req.body;
    const updates = {};
    if (notifyOnLimitReached !== undefined)
        updates.notify_on_limit_reached = notifyOnLimitReached;
    if (notifyWindowOpening !== undefined)
        updates.notify_window_opening = notifyWindowOpening;
    if (notifyWindowClosing !== undefined)
        updates.notify_window_closing = notifyWindowClosing;
    if (quietHoursStart !== undefined)
        updates.quiet_hours_start = quietHoursStart;
    if (quietHoursEnd !== undefined)
        updates.quiet_hours_end = quietHoursEnd;
    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No fields provided to update.' });
    }
    const { data, error } = await database_1.supabaseAdmin
        .from('notification_preferences')
        .update(updates)
        .eq('user_id', user.id)
        .select()
        .single();
    if (error) {
        return res.status(500).json({ error: 'Failed to update notification preferences.' });
    }
    res.json(data);
});
