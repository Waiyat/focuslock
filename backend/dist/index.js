"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_1 = require("./auth");
const users_1 = require("./users");
const devices_1 = require("./devices");
const screen_time_1 = require("./screen-time");
const notifications_1 = require("./notifications");
const feedback_1 = require("./feedback");
const app = (0, express_1.default)();
const port = process.env.PORT || 4000;
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Health Check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'focuslock-backend', timestamp: new Date().toISOString() });
});
// Modular Routes
app.use('/api/auth', auth_1.authRouter);
app.use('/api/users', users_1.usersRouter);
app.use('/api/devices', devices_1.devicesRouter);
app.use('/api/screen-time', screen_time_1.screenTimeRouter);
app.use('/api/notifications', notifications_1.notificationsRouter);
app.use('/api/feedback', feedback_1.feedbackRouter);
app.listen(port, () => {
    console.log(`FocusLock Backend listening on port ${port}`);
});
exports.default = app;
