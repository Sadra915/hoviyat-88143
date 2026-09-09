# HOVIYAT Premium UI v5

A frontend-only visual overhaul layered on top of the existing Hoviyat application contracts.

## Design direction
- Hoviyat orange identity retained and strengthened.
- Telegram-like interaction conventions are used as UX references, not copied code/assets.
- Frosted surfaces are quieter and more hierarchical than the previous glass stack.
- Conversation bubbles, composer, chat rows, filters, sheets, FAB and presence states receive tactile motion.
- Dynamic chat/message DOM is animated through `js/hoviyat-motion.js` without changing Supabase contracts.
- `prefers-reduced-motion` and Hoviyat power-saving modes remain respected.

## Frontend bugfixes in this pass
- Removed a malformed `iv>` token in `index.html` that could corrupt parsing around the channel composer.
- Added the premium CSS/JS files to the service-worker shell and bumped the cache version.

## Backend boundary
No SQL, schema, RLS policy, Supabase RPC, authentication contract, storage contract, or backend logic was modified.
