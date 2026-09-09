# HOVIYAT V5 Social + Reliability Pass

## Fixed
- Call and video-call buttons now invoke the existing WebRTC manager instead of the legacy development placeholder.
- Chat and Secret Chat use flex-column layouts with a single flexing message viewport, fixing nested/implicit-grid scrolling issues.
- AI chat panel is forcibly hidden outside the normal chat view, so it cannot float over Secret Chat composer.
- Auth visual overrides now target auth views outside `#appShell`.

## New social layer
- 24-hour stories with image/video upload.
- Story viewer with next/previous navigation.
- Story views and owner-only viewer list.
- Story likes and owner-only liker list.
- Story replies with notification generation.
- Notifications center for story activity.
- Private `story-media` Supabase Storage bucket.
- RLS for story content and activity.
- Public profile snapshots stored with story/activity rows so participant names can render without weakening the existing profile privacy policy.

## Admin
- New KPI counters for active stories, messages and notifications.
- Story moderation table with admin delete.
- Feature flag controls with enable/disable and rollout percentage.
- Recent admin audit activity.
- Dashboard refresh control.

## Validation
- `node tests/story-feature-audit.mjs` PASS
- `node tests/static-audit.mjs` PASS
- `node tests/navigation-regression.mjs` PASS
- `node build-dist.mjs` PASS
- Supabase security advisor still reports pre-existing SECURITY DEFINER warnings and disabled leaked-password protection. No new security advisor finding was introduced by the story layer.
