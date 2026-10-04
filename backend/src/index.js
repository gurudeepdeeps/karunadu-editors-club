/**
 * Karunadu Editors Club (KEC) Community Chat & Master Admin Backend
 * Powered by Cloudflare Workers, Cloudflare D1 (SQL), and Cloudflare R2 (Object Storage)
 * 
 * Features:
 * - GET  /api/health                       -> Healthcheck and server stats
 * - GET  /api/messages?channel={channel}   -> Fetches channel messages
 * - POST /api/messages                     -> Posts message with 15-second restriction enforced at edge
 * - POST /api/upload                       -> Uploads screenshot to R2 with 24-hour expiration metadata
 * - GET  /api/attachments/:key             -> Serves attachment (or 404 if expired > 24h)
 * 
 * Master Admin API (Securely Protected):
 * - POST /api/admin/login                  -> Verifies SHA-256 hashed password, generates cryptographically random token
 * - GET  /api/admin/verify                 -> Verifies current admin session token
 * - POST /api/admin/logout                 -> Revokes admin session token
 * - GET  /api/admin/messages               -> List recent messages across all channels with sender IP hash
 * - DELETE /api/admin/messages/:id         -> Deletes specific message & removes attachment from R2
 * - POST /api/admin/messages/purge-channel -> Purges all messages in a specific channel
 * - GET  /api/admin/catalog                -> Fetches all catalog software/plugin items
 * - POST /api/admin/catalog                -> Adds new software/plugin item
 * - PUT  /api/admin/catalog/:id            -> Updates existing software/plugin item
 * - DELETE /api/admin/catalog/:id         -> Deletes software/plugin item
 * - GET  /api/settings                     -> Public endpoint for global announcement banner & settings
 * - POST /api/admin/settings               -> Admin endpoint to update global announcement banner
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Token',
            'Access-Control-Max-Age': '86400',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Public Router
            if (url.pathname === '/api/health') {
                return jsonResponse({ status: 'ok', time: new Date().toISOString() }, 200, corsHeaders);
            }

            // Public Settings (e.g. Broadcast Announcements)
            if (url.pathname === '/api/settings' && request.method === 'GET') {
                return await handleGetPublicSettings(env, corsHeaders);
            }

            // Public Catalog Items (For Windows/Mac Software & Plugins pages)
            if (url.pathname === '/api/catalog' && request.method === 'GET') {
                return await handleGetPublicCatalog(request, env, corsHeaders);
            }

            if (url.pathname === '/api/messages') {
                if (request.method === 'GET') {
                    return await handleGetMessages(request, env, corsHeaders);
                } else if (request.method === 'POST') {
                    return await handlePostMessage(request, env, corsHeaders);
                }
            }

            if (url.pathname === '/api/upload' && request.method === 'POST') {
                return await handleUpload(request, env, corsHeaders);
            }

            if (url.pathname.startsWith('/api/attachments/')) {
                const key = url.pathname.replace('/api/attachments/', '');
                return await handleServeAttachment(key, env, corsHeaders);
            }

            // ================= MASTER ADMIN ROUTING =================
            if (url.pathname === '/api/admin/login' && request.method === 'POST') {
                return await handleAdminLogin(request, env, corsHeaders);
            }

            if (url.pathname === '/api/admin/verify' && request.method === 'GET') {
                return await handleAdminVerify(request, env, corsHeaders);
            }

            if (url.pathname === '/api/admin/logout' && request.method === 'POST') {
                return await handleAdminLogout(request, env, corsHeaders);
            }

            // Protected Admin Endpoints (Require valid X-Admin-Token or Authorization Bearer)
            if (url.pathname.startsWith('/api/admin/')) {
                const isAuthed = await verifyAdminSession(request, env);
                if (!isAuthed) {
                    return jsonResponse({ error: 'Unauthorized: Invalid or expired admin session token' }, 401, corsHeaders);
                }

                // Chat Moderation
                if (url.pathname === '/api/admin/messages' && request.method === 'GET') {
                    return await handleAdminGetMessages(request, env, corsHeaders);
                }
                if (url.pathname.startsWith('/api/admin/messages/') && request.method === 'DELETE') {
                    const msgId = url.pathname.replace('/api/admin/messages/', '');
                    return await handleAdminDeleteMessage(msgId, env, corsHeaders);
                }
                if (url.pathname === '/api/admin/messages/purge-channel' && request.method === 'POST') {
                    return await handleAdminPurgeChannel(request, env, corsHeaders);
                }

                // Catalog Management
                if (url.pathname === '/api/admin/catalog') {
                    if (request.method === 'GET') {
                        return await handleAdminGetCatalog(request, env, corsHeaders);
                    } else if (request.method === 'POST') {
                        return await handleAdminCreateCatalogItem(request, env, corsHeaders);
                    }
                }
                if (url.pathname.startsWith('/api/admin/catalog/')) {
                    const itemId = url.pathname.replace('/api/admin/catalog/', '');
                    if (request.method === 'PUT') {
                        return await handleAdminUpdateCatalogItem(itemId, request, env, corsHeaders);
                    } else if (request.method === 'DELETE') {
                        return await handleAdminDeleteCatalogItem(itemId, env, corsHeaders);
                    }
                }
                // Admin Icon Upload (Permanent - Not 24hr auto-delete)
                if (url.pathname === '/api/admin/upload-icon' && request.method === 'POST') {
                    return await handleAdminUploadIcon(request, env, corsHeaders);
                }

                // Global Settings / Announcements
                if (url.pathname === '/api/admin/settings' && request.method === 'POST') {
                    return await handleAdminUpdateSettings(request, env, corsHeaders);
                }
            }

            return jsonResponse({ error: 'Endpoint not found' }, 404, corsHeaders);
        } catch (err) {
            console.error('Worker error:', err);
            return jsonResponse({ error: 'Internal server error', details: err.message }, 500, corsHeaders);
        }
    }
};

// Helper: JSON response
function jsonResponse(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        }
    });
}

// Compute SHA-256 Hash of string
async function sha256(str) {
    const buf = new TextEncoder().encode(str);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Hash Client IP for privacy-friendly 15s rate limiting
async function getClientIpHash(request) {
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    const msgBuffer = new TextEncoder().encode(ip + '_kec_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

// ================= ADMIN AUTHENTICATION UTILS =================

function getAdminToken(request) {
    const headerToken = request.headers.get('X-Admin-Token');
    if (headerToken) return headerToken.trim();

    const auth = request.headers.get('Authorization') || '';
    if (auth.startsWith('Bearer ')) {
        return auth.substring(7).trim();
    }
    return null;
}

async function verifyAdminSession(request, env) {
    const token = getAdminToken(request);
    if (!token) return false;

    const now = Date.now();
    try {
        const session = await env.DB.prepare(`
            SELECT token, expires_at FROM admin_sessions WHERE token = ?
        `).bind(token).first();

        if (!session) return false;
        if (now > session.expires_at) {
            // Delete expired session
            await env.DB.prepare(`DELETE FROM admin_sessions WHERE token = ?`).bind(token).run();
            return false;
        }
        return true;
    } catch (e) {
        console.error('Session verify error:', e);
        return false;
    }
}

// POST /api/admin/login
async function handleAdminLogin(request, env, corsHeaders) {
    const body = await request.json().catch(() => ({}));
    const username = (body.username || '').trim();
    const password = (body.password || '').trim();

    // Environment configured credentials strictly from Cloudflare Secrets
    const expectedUsername = (env.ADMIN_USERNAME || 'admin').trim();
    
    // Require ADMIN_PASSWORD or ADMIN_PASSWORD_HASH to be explicitly set in Cloudflare Secrets
    const secretPassword = env.ADMIN_PASSWORD;
    const secretHash = env.ADMIN_PASSWORD_HASH;

    if (!secretPassword && !secretHash) {
        return jsonResponse({ 
            error: 'Server configuration error: ADMIN_PASSWORD is not configured in Cloudflare Secrets.' 
        }, 500, corsHeaders);
    }

    const expectedPassHash = secretHash || await sha256(secretPassword);
    const providedHash = await sha256(password);

    if (username !== expectedUsername || providedHash !== expectedPassHash) {
        return jsonResponse({ error: 'Invalid admin username or master password' }, 401, corsHeaders);
    }

    // Generate secure random session token (64 hex characters)
    const randomBytes = new Uint8Array(32);
    crypto.getRandomValues(randomBytes);
    const token = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const now = Date.now();
    const expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7-day session

    // Ensure admin_sessions table exists
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS admin_sessions (
            token TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        )
    `).run().catch(() => {});

    await env.DB.prepare(`
        INSERT INTO admin_sessions (token, created_at, expires_at)
        VALUES (?, ?, ?)
    `).bind(token, now, expiresAt).run();

    return jsonResponse({
        success: true,
        token,
        username,
        expiresAt
    }, 200, corsHeaders);
}

// GET /api/admin/verify
async function handleAdminVerify(request, env, corsHeaders) {
    const isAuthed = await verifyAdminSession(request, env);
    if (!isAuthed) {
        return jsonResponse({ authenticated: false }, 401, corsHeaders);
    }
    return jsonResponse({ authenticated: true }, 200, corsHeaders);
}

// POST /api/admin/logout
async function handleAdminLogout(request, env, corsHeaders) {
    const token = getAdminToken(request);
    if (token) {
        await env.DB.prepare(`DELETE FROM admin_sessions WHERE token = ?`).bind(token).run().catch(() => {});
    }
    return jsonResponse({ success: true, message: 'Logged out successfully' }, 200, corsHeaders);
}

// ================= CHAT ROOM MODERATION =================

// GET /api/admin/messages?channel={channel}&limit={limit}
async function handleAdminGetMessages(request, env, corsHeaders) {
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || '';
    const limit = parseInt(url.searchParams.get('limit') || '100', 10);

    let query = `
        SELECT id, channel, user_name as name, user_role as role, user_role_class as roleClass,
               avatar, avatar_color as avatarColor, text, attachment_url as attachment,
               attachment_name as attachmentName, attachment_key as attachmentKey,
               sender_ip_hash as ipHash, created_at as timestamp
        FROM messages
    `;
    const params = [];
    if (channel) {
        query += ` WHERE channel = ? `;
        params.push(channel);
    }
    query += ` ORDER BY created_at DESC LIMIT ? `;
    params.push(limit);

    const stmt = env.DB.prepare(query);
    const { results } = await stmt.bind(...params).all();

    return jsonResponse({ messages: results || [] }, 200, corsHeaders);
}

// DELETE /api/admin/messages/:id
async function handleAdminDeleteMessage(msgId, env, corsHeaders) {
    if (!msgId) {
        return jsonResponse({ error: 'Message ID is required' }, 400, corsHeaders);
    }

    // Check if message has an attachment to delete from R2
    const msg = await env.DB.prepare(`SELECT attachment_key FROM messages WHERE id = ?`).bind(msgId).first();
    if (msg && msg.attachment_key && env.BUCKET) {
        await env.BUCKET.delete(msg.attachment_key).catch(() => {});
    }

    await env.DB.prepare(`DELETE FROM messages WHERE id = ?`).bind(msgId).run();

    return jsonResponse({ success: true, message: `Message ${msgId} deleted` }, 200, corsHeaders);
}

// POST /api/admin/messages/purge-channel
async function handleAdminPurgeChannel(request, env, corsHeaders) {
    const body = await request.json().catch(() => ({}));
    const channel = (body.channel || '').trim();

    if (!channel) {
        return jsonResponse({ error: 'Channel name is required' }, 400, corsHeaders);
    }

    // Fetch all attachment keys for the channel to remove from R2
    const { results } = await env.DB.prepare(`
        SELECT attachment_key FROM messages WHERE channel = ? AND attachment_key IS NOT NULL
    `).bind(channel).all();

    if (results && results.length > 0 && env.BUCKET) {
        for (const row of results) {
            if (row.attachment_key) {
                await env.BUCKET.delete(row.attachment_key).catch(() => {});
            }
        }
    }

    await env.DB.prepare(`DELETE FROM messages WHERE channel = ?`).bind(channel).run();

    return jsonResponse({ success: true, message: `Channel ${channel} purged successfully` }, 200, corsHeaders);
}

// ================= CATALOG MANAGEMENT =================

// GET /api/admin/catalog
async function handleAdminGetCatalog(request, env, corsHeaders) {
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS catalog_items (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            badge TEXT DEFAULT 'Free',
            badge_variant TEXT DEFAULT 'secondary',
            description TEXT,
            item_name TEXT NOT NULL,
            item_tag TEXT,
            download_url TEXT NOT NULL,
            archive_password TEXT DEFAULT 'lofix',
            sort_order INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL
        )
    `).run().catch(() => {});

    const { results } = await env.DB.prepare(`
        SELECT * FROM catalog_items ORDER BY category ASC, sort_order ASC, created_at DESC
    `).all();

    return jsonResponse({ items: results || [] }, 200, corsHeaders);
}

// GET /api/catalog?category={category} (Public)
async function handleGetPublicCatalog(request, env, corsHeaders) {
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || '';

    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS catalog_items (
            id TEXT PRIMARY KEY,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            badge TEXT DEFAULT 'Free',
            badge_variant TEXT DEFAULT 'secondary',
            description TEXT,
            item_name TEXT NOT NULL,
            item_tag TEXT,
            download_url TEXT NOT NULL,
            archive_password TEXT DEFAULT 'lofix',
            sort_order INTEGER DEFAULT 0,
            icon_url TEXT,
            created_at INTEGER NOT NULL
        )
    `).run().catch(() => {});

    // Ensure icon_url column exists in existing tables
    await env.DB.prepare(`ALTER TABLE catalog_items ADD COLUMN icon_url TEXT`).run().catch(() => {});

    let query = `SELECT * FROM catalog_items`;
    const params = [];
    if (category) {
        query += ` WHERE category = ?`;
        params.push(category);
    }
    query += ` ORDER BY sort_order ASC, created_at DESC`;

    const { results } = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ items: results || [] }, 200, corsHeaders);
}

// POST /api/admin/catalog
async function handleAdminCreateCatalogItem(request, env, corsHeaders) {
    const body = await request.json().catch(() => ({}));
    const category = (body.category || 'windows-softwares').trim();
    const title = (body.title || '').trim();
    const itemName = (body.itemName || '').trim();
    const downloadUrl = (body.downloadUrl || '').trim();

    if (!title || !itemName || !downloadUrl) {
        return jsonResponse({ error: 'Title, Item Name, and Download URL are required' }, 400, corsHeaders);
    }

    const id = 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
    const badge = body.badge !== undefined && body.badge !== null ? String(body.badge).trim() : 'Free';
    const badgeVariant = body.badgeVariant !== undefined && body.badgeVariant !== null ? String(body.badgeVariant).trim() : 'secondary';
    const description = body.description !== undefined && body.description !== null ? String(body.description).trim() : '';
    const itemTag = body.itemTag !== undefined && body.itemTag !== null ? String(body.itemTag).trim() : 'Stable';
    const archivePassword = body.archivePassword !== undefined && body.archivePassword !== null ? String(body.archivePassword).trim() : 'lofix';
    const sortOrder = parseInt(body.sortOrder || '0', 10);
    const iconUrl = body.iconUrl !== undefined && body.iconUrl !== null ? String(body.iconUrl).trim() : null;
    const now = Date.now();

    // Ensure icon_url column exists
    await env.DB.prepare(`ALTER TABLE catalog_items ADD COLUMN icon_url TEXT`).run().catch(() => {});

    await env.DB.prepare(`
        INSERT INTO catalog_items (
            id, category, title, badge, badge_variant, description,
            item_name, item_tag, download_url, archive_password, sort_order, icon_url, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        id, category, title, badge, badgeVariant, description,
        itemName, itemTag, downloadUrl, archivePassword, sortOrder, iconUrl, now
    ).run();

    // If iconUrl is provided, propagate the icon to all items with the same title
    if (iconUrl) {
        await env.DB.prepare(`
            UPDATE catalog_items SET icon_url = ? WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))
        `).bind(iconUrl, title).run().catch(() => {});
    }

    return jsonResponse({ success: true, item: { id, category, title, itemName, downloadUrl, iconUrl } }, 201, corsHeaders);
}

// PUT /api/admin/catalog/:id
async function handleAdminUpdateCatalogItem(itemId, request, env, corsHeaders) {
    const body = await request.json().catch(() => ({}));
    
    // Explicitly normalize all fields: convert undefined to null so D1 driver never throws bind error
    const category = body.category !== undefined ? String(body.category).trim() : null;
    const title = body.title !== undefined ? String(body.title).trim() : null;
    const itemName = body.itemName !== undefined ? String(body.itemName).trim() : null;
    const downloadUrl = body.downloadUrl !== undefined ? String(body.downloadUrl).trim() : null;
    const badge = body.badge !== undefined ? String(body.badge).trim() : null;
    const badgeVariant = body.badgeVariant !== undefined ? String(body.badgeVariant).trim() : null;
    const description = body.description !== undefined ? String(body.description).trim() : null;
    const itemTag = body.itemTag !== undefined ? String(body.itemTag).trim() : null;
    const archivePassword = body.archivePassword !== undefined ? String(body.archivePassword).trim() : null;
    const sortOrder = body.sortOrder !== undefined ? parseInt(body.sortOrder, 10) : null;
    const iconUrl = body.iconUrl !== undefined ? String(body.iconUrl).trim() : null;

    // Ensure icon_url column exists
    await env.DB.prepare(`ALTER TABLE catalog_items ADD COLUMN icon_url TEXT`).run().catch(() => {});

    await env.DB.prepare(`
        UPDATE catalog_items
        SET category = COALESCE(?, category),
            title = COALESCE(?, title),
            item_name = COALESCE(?, item_name),
            download_url = COALESCE(?, download_url),
            badge = COALESCE(?, badge),
            badge_variant = COALESCE(?, badge_variant),
            description = COALESCE(?, description),
            item_tag = COALESCE(?, item_tag),
            archive_password = COALESCE(?, archive_password),
            sort_order = COALESCE(?, sort_order),
            icon_url = COALESCE(?, icon_url)
        WHERE id = ?
    `).bind(
        category, title, itemName, downloadUrl, badge, badgeVariant, description, itemTag, archivePassword, sortOrder, iconUrl, itemId
    ).run();

    // If iconUrl is provided, propagate the icon to ALL versions/items with the same title
    if (iconUrl) {
        // Find title of this item if not provided
        let targetTitle = title;
        if (!targetTitle) {
            const currentItem = await env.DB.prepare(`SELECT title FROM catalog_items WHERE id = ?`).bind(itemId).first();
            if (currentItem) targetTitle = currentItem.title;
        }
        if (targetTitle) {
            await env.DB.prepare(`
                UPDATE catalog_items SET icon_url = ? WHERE LOWER(TRIM(title)) = LOWER(TRIM(?))
            `).bind(iconUrl, targetTitle).run().catch(() => {});
        }
    }

    return jsonResponse({ success: true, message: `Item ${itemId} updated successfully` }, 200, corsHeaders);
}

// POST /api/admin/upload-icon
async function handleAdminUploadIcon(request, env, corsHeaders) {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) {
        return jsonResponse({ error: 'Expected multipart/form-data' }, 400, corsHeaders);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
        return jsonResponse({ error: 'No valid file provided' }, 400, corsHeaders);
    }

    // Limit icons to 2MB
    if (file.size > 2 * 1024 * 1024) {
        return jsonResponse({ error: 'Icon file exceeds 2 MB limit' }, 413, corsHeaders);
    }

    const ext = file.name.split('.').pop() || 'png';
    const key = `icon_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext.replace(/[^a-zA-Z0-9]/g, '')}`;

    // Store in Cloudflare R2 WITHOUT expiresAt metadata so it stays permanently!
    await env.BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: {
            contentType: file.type || 'image/png',
        },
        customMetadata: {
            uploadedAt: Date.now().toString(),
            originalName: file.name,
            assetType: 'software-icon'
        }
    });

    const url = new URL(request.url);
    const iconUrl = `${url.origin}/api/attachments/${key}`;

    return jsonResponse({
        success: true,
        key,
        name: file.name,
        url: iconUrl
    }, 200, corsHeaders);
}

// DELETE /api/admin/catalog/:id
async function handleAdminDeleteCatalogItem(itemId, env, corsHeaders) {
    await env.DB.prepare(`DELETE FROM catalog_items WHERE id = ?`).bind(itemId).run();
    return jsonResponse({ success: true, message: `Item ${itemId} deleted` }, 200, corsHeaders);
}

// ================= SITE SETTINGS & BROADCAST NOTICES =================

async function handleGetPublicSettings(env, corsHeaders) {
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS site_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        )
    `).run().catch(() => {});

    const { results } = await env.DB.prepare(`SELECT key, value, updated_at FROM site_settings`).all();
    const settings = {};
    (results || []).forEach(r => { settings[r.key] = r.value; });

    return jsonResponse({ settings }, 200, corsHeaders);
}

async function handleAdminUpdateSettings(request, env, corsHeaders) {
    const body = await request.json().catch(() => ({}));
    const key = (body.key || '').trim();
    const value = typeof body.value === 'string' ? body.value : JSON.stringify(body.value);
    const now = Date.now();

    if (!key) {
        return jsonResponse({ error: 'Setting key is required' }, 400, corsHeaders);
    }

    await env.DB.prepare(`
        INSERT INTO site_settings (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).bind(key, value, now).run();

    return jsonResponse({ success: true, key, value, updated_at: now }, 200, corsHeaders);
}

// ================= PUBLIC CHAT API HANDLERS =================

// 1. GET MESSAGES (Channel-specific, with 24h purge filter)
async function handleGetMessages(request, env, corsHeaders) {
    const url = new URL(request.url);
    const channel = url.searchParams.get('channel') || 'general-chat';
    const now = Date.now();

    // Fetch from D1
    const { results } = await env.DB.prepare(`
        SELECT id, channel, user_name as name, user_role as role, user_role_class as roleClass,
               avatar, avatar_color as avatarColor, text, attachment_url as attachment,
               attachment_name as attachmentName, attachment_expires_at, created_at as timestamp
        FROM messages
        WHERE channel = ?
        ORDER BY created_at ASC
        LIMIT 60
    `).bind(channel).all();

    // Check 24-hour expiration for attachments
    const cleaned = (results || []).map(row => {
        let hasExpired = false;
        if (row.attachment_expires_at && now > row.attachment_expires_at) {
            hasExpired = true;
        }
        return {
            id: row.id,
            name: row.name,
            role: row.role,
            roleClass: row.roleClass,
            avatar: row.avatar,
            avatarColor: row.avatarColor,
            time: formatTime(row.timestamp),
            timestamp: row.timestamp,
            text: row.text,
            attachment: hasExpired ? null : row.attachment,
            attachmentName: row.attachmentName,
            attachmentExpired: hasExpired
        };
    });

    return jsonResponse({ channel, messages: cleaned }, 200, corsHeaders);
}

// 2. POST MESSAGE (Enforces 15s Slowmode Restriction at the Edge)
async function handlePostMessage(request, env, corsHeaders) {
    const ipHash = await getClientIpHash(request);
    const now = Date.now();
    const cooldownSec = parseInt(env.COOLDOWN_SECONDS || '15', 10);
    const cooldownMs = cooldownSec * 1000;

    // Check rate limit in D1
    const rateCheck = await env.DB.prepare(`
        SELECT last_sent_at FROM rate_limits WHERE ip_hash = ?
    `).bind(ipHash).first();

    if (rateCheck) {
        const elapsed = now - rateCheck.last_sent_at;
        if (elapsed < cooldownMs) {
            const waitRemaining = Math.ceil((cooldownMs - elapsed) / 1000);
            return jsonResponse({
                error: `Slowmode active: Please wait ${waitRemaining}s before sending another message.`,
                remaining: waitRemaining
            }, 429, corsHeaders);
        }
    }

    const body = await request.json().catch(() => ({}));
    const text = (body.text || '').trim();
    const channel = body.channel || 'general-chat';
    const attachmentUrl = body.attachment || null;
    const attachmentName = body.attachmentName || null;
    const attachmentKey = body.attachmentKey || null;

    if (!text && !attachmentUrl) {
        return jsonResponse({ error: 'Message cannot be empty' }, 400, corsHeaders);
    }

    const id = 'msg_' + now + '_' + Math.random().toString(36).substring(2, 7);
    const userName = body.name || 'You (Editor)';
    const userRole = body.role || 'Community Member';
    const userRoleClass = body.roleClass || 'role-member';
    const avatar = (userName.trim()[0] || 'E').toUpperCase();
    const avatarColor = body.avatarColor || 'avatar-blue';

    // 24 hours expiry for attachments
    const expiresAt = attachmentUrl ? (now + (24 * 60 * 60 * 1000)) : null;

    // Insert into D1
    await env.DB.prepare(`
        INSERT INTO messages (
            id, channel, user_name, user_role, user_role_class,
            avatar, avatar_color, text, attachment_url, attachment_name,
            attachment_key, attachment_expires_at, sender_ip_hash, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
        id, channel, userName, userRole, userRoleClass,
        avatar, avatarColor, text, attachmentUrl, attachmentName,
        attachmentKey, expiresAt, ipHash, now
    ).run();

    // Update rate limit table
    await env.DB.prepare(`
        INSERT INTO rate_limits (ip_hash, last_sent_at)
        VALUES (?, ?)
        ON CONFLICT(ip_hash) DO UPDATE SET last_sent_at = excluded.last_sent_at
    `).bind(ipHash, now).run();

    return jsonResponse({
        success: true,
        message: {
            id,
            name: userName,
            role: userRole,
            roleClass: userRoleClass,
            avatar,
            avatarColor,
            time: 'Today at ' + new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            timestamp: now,
            text,
            attachment: attachmentUrl,
            attachmentName
        }
    }, 201, corsHeaders);
}

// 3. UPLOAD SCREENSHOT TO R2
async function handleUpload(request, env, corsHeaders) {
    const contentType = request.headers.get('Content-Type') || '';
    if (!contentType.includes('multipart/form-data')) {
        return jsonResponse({ error: 'Expected multipart/form-data' }, 400, corsHeaders);
    }

    const formData = await request.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
        return jsonResponse({ error: 'No valid file provided' }, 400, corsHeaders);
    }

    // Limit to 3MB
    if (file.size > 3 * 1024 * 1024) {
        return jsonResponse({ error: 'File exceeds 3 MB limit' }, 413, corsHeaders);
    }

    const key = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '')}`;
    
    // Store in Cloudflare R2 with 24-hour expiration custom metadata
    await env.BUCKET.put(key, await file.arrayBuffer(), {
        httpMetadata: {
            contentType: file.type || 'image/png',
        },
        customMetadata: {
            uploadedAt: Date.now().toString(),
            expiresAt: (Date.now() + (24 * 60 * 60 * 1000)).toString(),
            originalName: file.name
        }
    });

    const url = new URL(request.url);
    const attachmentUrl = `${url.origin}/api/attachments/${key}`;

    return jsonResponse({
        success: true,
        key,
        name: file.name,
        url: attachmentUrl,
        expiresIn: '24 hours'
    }, 200, corsHeaders);
}

// 4. SERVE ATTACHMENTS (Guards 24-Hour Expiration)
async function handleServeAttachment(key, env, corsHeaders) {
    const object = await env.BUCKET.get(key);
    if (!object) {
        return new Response('Attachment expired or not found', { status: 404, headers: corsHeaders });
    }

    const expiresAt = parseInt(object.customMetadata?.expiresAt || '0', 10);
    if (expiresAt && Date.now() > expiresAt) {
        await env.BUCKET.delete(key);
        return new Response('Attachment has expired (24-hour retention period reached)', { status: 410, headers: corsHeaders });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'public, max-age=3600');
    Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));

    return new Response(object.body, { headers });
}

function formatTime(timestamp) {
    const d = new Date(timestamp);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    return (isToday ? 'Today at ' : d.toLocaleDateString() + ' ') + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
