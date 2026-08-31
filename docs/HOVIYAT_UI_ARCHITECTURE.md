# HOVIYAT UI/UX REDESIGN ARCHITECTURE

## Non-negotiable boundary

This redesign is frontend-only. No SQL file, migration, schema, RLS policy, Supabase function, or backend logic is modified.

## Shell

`App Shell -> Product Strip -> Views Area -> Conversation`

Desktop uses a persistent two-pane composition when a conversation is open: chat list + conversation. Mobile collapses to a single active pane.

## Frontend modules

- `js/app.js`: application coordinator and existing Supabase contracts.
- `js/chat.js`: private chat data contract.
- `js/groups.js`: group data contract.
- `js/channels.js`: channel data contract.
- `js/call.js`: WebRTC/Supabase Broadcast call contract, preserved.
- `js/voice.js`: MediaRecorder contract, preserved.
- `js/secretchat.js` + `js/secret-crypto.js`: secret-chat data/crypto, preserved.
- `js/hoviyat-flow.js`: centralized frontend-only motion, responsive shell, keyboard affordances, power profile hooks.
- `css/hoviyat-redesign.css`: canonical UI layer loaded last to override legacy visual layers without changing existing selectors/contracts.

## State boundaries

Authentication, Realtime subscriptions, message APIs, media storage, calls and secret chat remain in existing modules. The redesign layer only controls presentation, navigation composition and client-side affordances.

## Missing backend capabilities

Where a requested feature is not represented by the current API/schema, the UI should render an explicit unavailable/placeholder state rather than fabricating persistence. No schema changes are introduced by this redesign.
