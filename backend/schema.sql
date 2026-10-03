-- Karunadu Editors Club Community Chat D1 Database Schema
-- Stores channel messages and enforces automatic 24h attachment metadata tracking

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel TEXT NOT NULL,
    user_name TEXT NOT NULL,
    user_role TEXT DEFAULT 'Community Member',
    user_role_class TEXT DEFAULT 'role-member',
    avatar TEXT NOT NULL,
    avatar_color TEXT NOT NULL,
    text TEXT NOT NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    attachment_key TEXT,
    attachment_expires_at INTEGER,
    sender_ip_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Index for speedy queries by channel & timestamp
CREATE INDEX IF NOT EXISTS idx_messages_channel_created ON messages (channel, created_at DESC);

-- Rate-limiting table for the 30-second restriction
CREATE TABLE IF NOT EXISTS rate_limits (
    ip_hash TEXT PRIMARY KEY,
    last_sent_at INTEGER NOT NULL
);

-- Index for purging expired attachments and old messages
CREATE INDEX IF NOT EXISTS idx_messages_expiry ON messages (attachment_expires_at) WHERE attachment_expires_at IS NOT NULL;

-- Admin sessions table for secure server-side authenticated sessions
CREATE TABLE IF NOT EXISTS admin_sessions (
    token TEXT PRIMARY KEY,
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);

-- Site settings and global alert/announcement controller
CREATE TABLE IF NOT EXISTS site_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);

-- Software & Plugin Catalog Table (Manage software cards, versions, passwords, links)
CREATE TABLE IF NOT EXISTS catalog_items (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,          -- 'windows-softwares', 'mac-softwares', 'windows-plugins', 'mac-plugins', 'blender-addons'
    title TEXT NOT NULL,             -- e.g. 'Adobe After Effects'
    badge TEXT DEFAULT 'Free',       -- e.g. 'Latest', 'Free', 'Stable'
    badge_variant TEXT DEFAULT 'secondary',
    description TEXT,
    item_name TEXT NOT NULL,         -- e.g. 'AE 2025'
    item_tag TEXT,                   -- e.g. 'v25.31.003 • Latest'
    download_url TEXT NOT NULL,      -- Drive / direct link
    archive_password TEXT DEFAULT 'lofix',
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_catalog_category ON catalog_items (category, sort_order ASC);

