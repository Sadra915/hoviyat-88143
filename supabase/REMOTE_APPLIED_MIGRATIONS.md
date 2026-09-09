# Remote Supabase migration reconciliation

Project: `ejftgzrrjttntbsapjgz`

These migrations were applied directly to the connected Supabase project on 2026-09-07 because the original package contained SQL files that had not been executed remotely.

- `20260907101910` — `harden_rpc_acl_and_internal_tables_v3`
- `20260907102039` — `restore_missing_preferences_and_chat_folders`
- `20260907102056` — `restore_group_moderation_dependencies`
- `20260907102142` — `complete_group_moderation_and_admin_audit`
- `20260907102151` — `tighten_remaining_rls_and_admin_views`

The authoritative remote migration history is the source of truth. The existing `supabase/next/*.sql` files are kept as human-readable feature SQL; they are not renamed into fake migration files.

- 20260907104300 `harden_private_media_storage_v1` — private chat/group/channel media buckets, authenticated Storage policies, upload size/MIME limits, corrected channel media path authorization.
- 20260907104400 `upgrade_secret_crypto_envelope_v3_fix` — Secret Chat protocol v3 storage: per-message salt, crypto version 3, stricter RPC validation, safe search_path, authenticated-only new secret-message RPC signature.
- 20260907104500 `harden_media_rpc_validation_v1` — added video message type and strict `storage://<bucket>/<conversation-id>/...` validation to chat/group/channel send RPCs.

## 2026-09-07 — message RPC execution tightening v5
- Revoked browser execution of legacy `send_secret_message` overloads.
- Revoked the legacy 6-argument `send_group_message` overload; the app uses the reply-capable 7-argument overload.
- Ensured `anon` cannot execute message-send RPCs.
- Kept authenticated execution only for the app-used `send_chat_message`, reply-capable `send_group_message`, `post_channel_message`, `get_or_create_secret_chat`, and Secret Chat v3 sender.
- Added fingerprint-change detection in the client for Secret Chat peer keys.
- Deployed authenticated `hoviyat-ai` Edge Function with server-side provider configuration and local fallback. Provider secrets are intentionally not embedded in the browser.

- 20260907105400 `add_stories_notifications_admin_controls_v1` — 24h stories, views, reactions, replies, notifications, feature flags, private story-media bucket, RLS and notification triggers.
- 20260907105500 `cleanup_story_policy_duplicates_v1` — consolidated story RLS policies and removed duplicate indexes.
- 20260907105600 `harden_story_profile_snapshots_v1` — snapshot public actor/profile fields into story activity rows so story participants can be displayed without widening profile privacy.

- `add_per_user_restrictions_v8` — per-user granular restrictions, presets, expiry/reason, server-side action gates, storage/story/channel enforcement.
- `harden_user_restrictions_rpc_overloads` — hardened message/reaction/secret-chat RPC overloads so legacy signatures cannot bypass restrictions.
- `harden_media_types_and_storage_paths_v132` — aligned group/channel/story media constraints and corrected private media storage path policies.
