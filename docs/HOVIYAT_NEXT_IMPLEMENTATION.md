# HOVIYAT Next implementation notes

## Included in this drop
- Admin & Moderation V2 UI (`js/admin-moderation-v2.js`, `css/admin-v2.css`)
- Group member roles: owner/admin/moderator/helper/member
- Member actions: promote, role change, restrict, mute, remove, ban, permissions
- Server-side group moderation RPC + trigger (`supabase/next/012_group_moderation_v2.sql`)
- Report queue fields and admin status workflow
- Admin audit log table/RPC
- User-facing Experience Control Center for theme, glass, density, wallpaper, animation and power preferences

## Deployment order
1. Replace the repository files with the ZIP contents.
2. Run existing SQL migrations in order, then `012_group_moderation_v2.sql`.
3. Re-test login, realtime chat, group messaging, channel posts and calls.
4. Test every privileged moderation action with a non-admin account to confirm denial.

## Important
Passkeys, secure Storage, push notifications, true native screenshot prevention, real AI, and native OS battery controls need platform/backend support. The client does not pretend to implement those boundaries locally.
