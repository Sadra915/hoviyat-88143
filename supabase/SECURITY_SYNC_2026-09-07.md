# Hoviyat Supabase security sync

Remote project: `ejftgzrrjttntbsapjgz`

## Repaired missing SQL
- `user_preferences`
- `chat_folders`
- `chat_folder_items` (corrected FK type to `text`, matching `chats.id`)
- `group_member_moderation`
- `admin_action_log`
- `admin_security_summary`
- group moderation and report moderation RPCs

## Security hardening applied remotely
- Internal `_server_secrets` and `_rate_events` tables are no longer browser-readable.
- Anonymous execution was removed from the application SECURITY DEFINER RPC surface.
- Internal SECURITY DEFINER helpers have no browser EXECUTE privilege.
- Default privileges in `public` now revoke accidental browser access for newly-created tables/functions.
- Admin summary view uses `security_invoker=true` and is not granted to normal browser roles.
- Deprecated `auth.role()` usage in announcements read policy was removed.
- RLS remains enabled on application tables and restored tables.

## Remaining Supabase dashboard action
Supabase Security Advisor still reports **Leaked Password Protection Disabled**. This is an Auth configuration setting, not a Postgres migration, so it must be enabled in the Supabase Auth password-security settings.

The remaining `authenticated_security_definer_function_executable` advisor warnings are deliberate for RPCs that the browser app needs. Anonymous execution has been removed and each sensitive RPC performs its own authorization checks. These warnings are therefore a review signal, not proof that those RPCs are publicly callable without authentication.
