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
