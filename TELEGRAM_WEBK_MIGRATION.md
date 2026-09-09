# HOVIYAT → Telegram Web K migration plan

## Current project

HOVIYAT currently has a vanilla JavaScript/CSS UI with application logic split across:
- `js/app.js`
- `js/ui.js`
- `js/chat.js`
- `js/groups.js`
- `js/channels.js`
- `js/auth.js`
- `js/supabase-init.js`
- related media/voice/call/security modules

The data/authentication layer should not be blindly deleted.

## Target

Use the official Telegram Web K source as the UI/client reference and integrate it as a separate frontend layer.
Keep HOVIYAT's name, logo, icon and brand identity.

## Important technical fact

Telegram Web K is not merely a CSS/JS theme. Its repository contains a complete Solid.js + TypeScript + SCSS web client,
including its own MTProto implementation, IndexedDB/CacheStorage/localStorage, workers and build pipeline.

Therefore a real integration requires an adapter boundary:

Telegram-like UI
        ↓
HOVIYAT adapter / service interfaces
        ↓
HOVIYAT Supabase auth + database + messaging

This is safer than deleting HOVIYAT's data layer and trying to make Telegram's MTProto client talk to Supabase.

## Reproducible next step

Run `scripts/fetch-telegram-web-k.sh` (Linux/macOS) or the `.ps1` version on Windows.

Then the UI migration can be performed against the actual Telegram Web K source tree.

## License

Telegram Web K is GPLv3. If its source is incorporated/distributed as a modified work, GPLv3 obligations must be reviewed and followed.
