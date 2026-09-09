-- Hoviyat security/media upgrade v3
-- Remote companion: 2026-09-07
-- 1) Private chat/group/channel media buckets + authenticated Storage policies
-- 2) Storage references instead of public URLs
-- 3) Secret Chat protocol v3: per-message HKDF salt + double AES-GCM envelope
-- 4) Backward-compatible v2 secret-message reads
-- 5) Strict media type/path validation in message RPCs

-- Apply the exact SQL from the remote migration history before using this file
-- as a local migration if the remote database is already ahead.
