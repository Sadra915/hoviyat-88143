# Hoviyat Release 2026 — Google Auth Setup

## Supabase Auth

Enable **Google** in Authentication → Sign In / Providers.

Use the **Web OAuth client ID first** in Client IDs. If you later create a native Android client ID, it can be added after the web ID, comma-separated.

- Client Secret: the Web OAuth client secret
- Skip nonce checks: **OFF**
- Allow users without an email: **OFF**

## Google Cloud

Authorized redirect URI:

`https://ejftgzrrjttntbsapjgz.supabase.co/auth/v1/callback`

Authorized JavaScript origin:

For the app-only build, this is not used by the native callback. Keep only origins actually used by any web build. The Android OAuth callback is the Supabase callback below.

## Supabase URL Configuration

Set **Site URL** to `ir.hoviyat.app://auth/oauth` for the app-only release. If you later bring back a web build, use its HTTPS URL there instead.

Add these Additional Redirect URLs:

- `ir.hoviyat.app://auth/oauth`
- `ir.hoviyat.admin://auth/oauth`

The app uses the website URL on the web and the custom scheme inside the Capacitor APKs.

## Admin

The database function `public.is_admin()` already allows the configured admin UUID and `sdratyrgryan@gmail.com`. The Admin UI also checks that email, but server-side authorization remains the source of truth.

Do not put Google client secrets, AI secrets, or service-role keys into the frontend.
