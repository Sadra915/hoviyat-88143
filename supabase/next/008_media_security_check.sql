-- HOVIYAT NEXT 008: non-destructive media security audit.
-- Intentionally does NOT flip public buckets automatically because existing
-- rows currently store public media URLs. Flipping them without a signed-URL
-- migration would break old media. Run the audit first.
select id,name,public from storage.buckets where id in ('avatars','chat-media','group-media','channel-media');

-- Recommended target state after the client migration to storage paths:
-- update storage.buckets set public=false where id in ('chat-media','group-media','channel-media');
-- Keep avatars public only if profile photos are intentionally public.
