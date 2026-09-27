/**
 * Karunadu Editors Club (KEC) Community Chat Backend
 * Powered by Cloudflare Workers, Cloudflare D1 (SQL), and Cloudflare R2 (Object Storage)
 * 
 * Features:
 * - GET  /api/messages?channel={channel}  -> Fetches channel messages (with 24h attachment purge check)
 * - POST /api/messages                    -> Posts message with 30-second restriction enforced at edge
 * - POST /api/upload                      -> Uploads screenshot to R2 with 24-hour expiration metadata
 * - GET  /api/attachments/:key            -> Serves attachment (or 404 if expired > 24h)
 * - GET  /api/health                      -> Healthcheck and server stats
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin') || '';

        // CORS headers
        const corsHeaders = {
            'Access-Control-Allow-Origin': origin || '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        };

        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            // Router
            if (url.pathname === '/api/health') {
                return jsonResponse({ status: 'ok', time: new Date().toISOString() }, 200, corsHeaders);
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

// Hash Client IP for privacy-friendly 30s rate limiting
async function getClientIpHash(request) {
    const ip = request.headers.get('CF-Connecting-IP') || '127.0.0.1';
    const msgBuffer = new TextEncoder().encode(ip + '_kec_salt');
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

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
    const cleaned = results.map(row => {
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

// 2. POST MESSAGE (Enforces 30s Slowmode Restriction at the Edge)
async function handlePostMessage(request, env, corsHeaders) {
    const ipHash = await getClientIpHash(request);
    const now = Date.now();
    const cooldownSec = parseInt(env.COOLDOWN_SECONDS || '30', 10);
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

    const body = await request.json();
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

    // Check expiration from metadata
    const expiresAt = parseInt(object.customMetadata?.expiresAt || '0', 10);
    if (expiresAt && Date.now() > expiresAt) {
        // Automatically delete from R2 bucket
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
