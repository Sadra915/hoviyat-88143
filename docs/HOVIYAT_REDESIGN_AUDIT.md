# HOVIYAT MASTER REDESIGN AUDIT

Date: 2026-08-30

## Source package

`HOVIYAT_MASTER_MERGED_5.2_MEGA_UPGRADE.zip` was extracted without changing its contents.

## File classification

### DO NOT TOUCH

- `supabase/final/001_hoviyat_ultimate_preferences.sql`
- `supabase/final/002_hoviyat_mega_upgrade.sql`
- `supabase/hotfix_2_sticker_xss.sql`
- `supabase/hotfix_3_missing_group_columns.sql`
- `supabase/hotfix_4_reports_columns.sql`
- `supabase/hotfix_gen_salt.sql`
- `supabase/migration_2_read_receipts_and_avatars.sql`
- `supabase/migration_3_security_hardening.sql`
- `supabase/migration_4_group_blocking.sql`
- `supabase/migration_5_secretchat_verification_bans.sql`
- `supabase/next/006_user_preferences_and_folders.sql`
- `supabase/next/007_security_audit_and_rate_limits.sql`
- `supabase/next/008_media_security_check.sql`
- `supabase/next/009_message_lifecycle.sql`
- `supabase/next/010_storage_hardening_plan.sql`
- `supabase/next/011_admin_audit.sql`
- `supabase/next/012_group_moderation_v2.sql`
- `supabase/security_selftest.mjs`
- existing app icons under `assets/icons/`

### MODIFY

- `index.html`
- `admin.html` (later visual alignment only)
- `css/style.css`
- `css/hoviyat-v2.css`
- `css/hoviyat-next.css`
- `css/hoviyat-ultimate.css`
- `css/hoviyat-control-center.css`
- `css/admin-v2.css` (admin visual alignment later)
- `js/app.js`
- `js/ui.js`
- other frontend modules only where presentation/cleanup requires it
- `service-worker.js`
- product documentation

### NEW

- `css/hoviyat-redesign.css`
- `js/hoviyat-flow.js`
- `tests/*`
- redesign/architecture documentation

### FRONTEND INTEGRATION / BACKEND DEPENDENCY

- `js/supabase-init.js`: Supabase client and auth compatibility layer. Contract must stay stable.
- `js/auth.js`: Supabase Auth + profiles.
- `js/chat.js`: private chat RPCs/tables/storage.
- `js/groups.js`: groups RPCs/tables/storage.
- `js/channels.js`: channels RPCs/tables/storage.
- `js/call.js`: WebRTC + Supabase Broadcast.
- `js/voice.js`: browser MediaRecorder.
- `js/secretchat.js`: secret-chat tables/RPCs.
- `js/secret-crypto.js`: client-side Web Crypto.
- `js/security.js`: security-settings/session RPCs.

## Dependency graph

```text
Supabase Auth
   |
   +--> App Shell
          |
          +--> Chat List
          |      +--> Private Chat
          |      +--> Groups
          |      +--> Channels
          |
          +--> Conversation
          |      +--> Messages
          |      +--> Media
          |      +--> Voice
          |      +--> Reactions
          |      +--> Reply / Pin / Report
          |
          +--> Secret Chat
          |      +--> Web Crypto
          |
          +--> Calls
          |      +--> WebRTC
          |
          +--> Settings / Security / Devices
          |
          +--> Identity / Profile
          |
          +--> Admin
```

## P0 findings

1. **Duplicate DOM IDs** existed for `view-group-blocked`, `backFromGroupBlocked`, and `groupBlockedReasonText`. The duplicate block was redundant and unsafe for `querySelector/getElementById` behavior.
2. **Private chat rendered the same message list twice** inside its Realtime callback. This was a direct duplicate render bug.
3. **Message rendering always forced `scrollTop = scrollHeight`**. Any Realtime refresh could kick a user reading older messages back to the bottom.
4. **Every message Realtime event re-fetched the whole message list and rebuilt the whole message DOM**. This is the largest performance bottleneck for long chats.
5. **No virtualization/pagination layer exists for private messages**, while group/channel/secret message watchers use hard limits (300/500). Large conversations therefore either re-render too much or stop seeing older messages.
6. `exitToAuth()` did not clear the secret-chat subscriptions/countdown or the call inbox listener. This can leak listeners across logout/login cycles.
7. `maybeShowAppLock()` invoked `showLockScreen()` twice when the lock was enabled.
8. The Service Worker shell list omitted `call.js`, `security.js`, `secretchat.js`, `secret-crypto.js`, `hoviyat-next.js`, `hoviyat-control-center.js`, `hoviyat-ultimate.js`, `media-editor.js`, and `admin-moderation-v2.js`. Offline behavior therefore cannot reliably cover the full app shell.
9. The bundled frontend has no `package.json`/build pipeline. QA is currently closer to static/browser smoke testing than a reproducible production build.
10. The bundled SQL set is incremental and does not include the original base schema file referenced in code comments/docs. Many frontend RPCs are therefore externally dependent on the live Supabase project state rather than provable from this ZIP alone.

## Security notes

- Private chat body encryption described by the existing project is server-side encryption at rest, not E2E.
- Secret Chat uses Web Crypto ECDH P-256 + AES-GCM in the browser and stores the private key in localStorage. This is a real client-side cryptographic flow, but device loss/localStorage loss breaks recovery.
- Chat/group/channel media functions use public Storage URLs. The existing SECURITY.md already flags this as a migration issue.
- `screenshot_shield` is a preference/UI behavior, not a native screenshot prevention mechanism.
- `revoke_session()` removes the session record but does not instantly revoke an already-issued Supabase JWT.

## Telegram reference archive

The uploaded `Telegram_master.zip` begins with ZIP local-file headers but has no central-directory/end-of-central-directory record. Standard ZIP validation therefore fails. It was not used as a source of code/assets. The redesign uses only generic UX patterns and Hoviyat-owned implementation.
