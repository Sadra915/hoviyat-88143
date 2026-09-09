# Hoviyat Android Google OAuth Fix

## What changed

- Native Google OAuth now uses Supabase `skipBrowserRedirect` and opens the generated authorization URL in the native Capacitor Browser instead of navigating the Hoviyat WebView to Google.
- OAuth callback remains app-only: `ir.hoviyat.app://auth/oauth`.
- Capacitor App URL handling consumes the callback and restores the Supabase session.
- Native Supabase clients no longer try to parse OAuth callbacks from the WebView URL (`detectSessionInUrl` is disabled on native and remains enabled on web).
- Android `MainActivity` is patched with `singleTask` and an exact deep-link intent filter for `/oauth`.
- The deep-link handler validates the scheme, host, and path before accepting tokens.
- The native Browser is closed after a successful callback.
- `@capacitor/browser` was added to dependencies.

## Build

```bash
npm install
npm run app:add-android
# or, if android/ already exists:
npm run app:sync
npm run app:open
```

The build scripts automatically patch the Android manifest.

## Supabase / Google Cloud

The Google Cloud OAuth client must keep the Supabase callback URI:

`https://ejftgzrrjttntbsapjgz.supabase.co/auth/v1/callback`

Supabase Auth URL Configuration must allow:

`ir.hoviyat.app://auth/oauth`

No Hoviyat website URL is required for the Android app-only OAuth flow.
