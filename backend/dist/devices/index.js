"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.devicesRouter = void 0;
const express_1 = require("express");
const database_1 = require("../database");
const auth_1 = require("../middleware/auth");
exports.devicesRouter = (0, express_1.Router)();
exports.devicesRouter.use(auth_1.requireAuth);
/**
 * POST /api/devices/register
 * Registers or updates a device for the authenticated user.
 */
exports.devicesRouter.post('/register', async (req, res) => {
    const user = req.user;
    const { deviceName, platform, pushToken } = req.body;
    if (!deviceName || !platform) {
        return res.status(400).json({ error: 'deviceName and platform are required.' });
    }
    if (!['ios', 'android'].includes(platform)) {
        return res.status(400).json({ error: 'platform must be ios or android.' });
    }
    const { data, error } = await database_1.supabaseAdmin
        .from('devices')
        .insert({
        user_id: user.id,
        device_name: deviceName,
        platform,
        push_token: pushToken ?? null,
        is_active: true,
        last_seen_at: new Date().toISOString(),
    })
        .select()
        .single();
    if (error) {
        console.error('[/devices/register] Supabase error:', error);
        return res.status(500).json({ error: 'Failed to register device.' });
    }
    res.status(201).json(data);
});
/**
 * GET /api/devices
 * Lists all devices for the authenticated user.
 */
exports.devicesRouter.get('/', async (req, res) => {
    const user = req.user;
    const { data, error } = await database_1.supabaseAdmin
        .from('devices')
        .select('*')
        .eq('user_id', user.id)
        .order('last_seen_at', { ascending: false });
    if (error) {
        return res.status(500).json({ error: 'Failed to fetch devices.' });
    }
    res.json(data);
});
/**
 * PATCH /api/devices/:deviceId/heartbeat
 * Updates last_seen_at and optionally the push token.
 */
exports.devicesRouter.patch('/:deviceId/heartbeat', async (req, res) => {
    const user = req.user;
    const { deviceId } = req.params;
    const { pushToken } = req.body;
    const updates = {
        last_seen_at: new Date().toISOString(),
    };
    if (pushToken !== undefined)
        updates.push_token = pushToken;
    const { error } = await database_1.supabaseAdmin
        .from('devices')
        .update(updates)
        .eq('id', deviceId)
        .eq('user_id', user.id);
    if (error) {
        return res.status(500).json({ error: 'Heartbeat update failed.' });
    }
    res.json({ message: 'Device heartbeat recorded.' });
});
