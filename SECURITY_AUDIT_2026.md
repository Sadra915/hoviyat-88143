# Hoviyat Security / Performance Audit — Release 2026

## Fixed in this release

- Messenger/Admin runtime separation.
- Admin server-side gate remains backed by `public.is_admin()`.
- Privacy preferences have per-user RLS.
- Blocked-user relation has per-user RLS.
- Call permission is checked through a server-side function.
- Story privacy selection is enforced at the database policy boundary.
- Message sending uses server-side membership, restriction, block and rate checks in `send_chat_message`.
- Storage usage is calculated server-side and scoped to the current authenticated user.
- New indexes were added for message, session, story, moderation and reporting access paths.
- RLS policies using `auth.uid()` were rewritten to use the Supabase-recommended initplan-friendly pattern where applicable.

## Remaining advisor findings

Supabase still reports a set of existing `SECURITY DEFINER` functions executable by authenticated users. Many are intentional user-facing RPCs that enforce authorization inside the function, so blindly revoking them would break application features. Admin functions should continue to be reviewed individually and moved behind stricter API boundaries if the architecture later allows it.

Supabase also reports unused indexes. These should not be deleted immediately because production usage statistics are still evolving.

Most importantly, Supabase currently reports **Leaked Password Protection disabled**. Enable it in the Auth security/password settings before a public production launch.

This audit therefore does **not** claim that Hoviyat has perfect security. It records the hardening performed and the remaining platform-level configuration work.
