"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
/**
 * Express middleware that:
 * 1. Reads the Bearer JWT from Authorization header
 * 2. Validates it against Supabase (uses the anon client + token)
 * 3. Attaches the verified user to req.user
 * 4. Rejects any tampered, expired or missing tokens — cannot be bypassed
 */
async function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required. No token provided.' });
    }
    const token = authHeader.substring(7);
    // Create a scoped client using the user's own JWT — Supabase validates signature + expiry
    const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) {
        return res.status(401).json({ error: 'Invalid or expired authentication token.' });
    }
    // Attach user to request for downstream handlers
    req.user = user;
    next();
}
