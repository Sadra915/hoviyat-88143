# Hoviyat Android Google OAuth Fix V2

This release uses the native-mobile OAuth pattern with Supabase PKCE.

## Flow

1. Hoviyat asks Supabase for the Google OAuth URL with `skipBrowserRedirect` on Android.
2. Google opens in the system browser / Custom Tab.
3. After the user presses Continue, Google returns to the Supabase callback.
4. Supabase redirects to `ir.hoviyat.app://auth/oauth?code=...`.
5. Android reopens Hoviyat through the custom URL scheme.
6. Hoviyat receives the authorization code through Capacitor App and calls `exchangeCodeForSession(code)`.
7. The Supabase session is persisted and the app continues normally.

## Important Supabase settings

Additional Redirect URL:

`ir.hoviyat.app://auth/oauth`

Google Cloud OAuth authorized redirect URI:

`https://ejftgzrrjttntbsapjgz.supabase.co/auth/v1/callback`

Do not remove the Supabase callback above from Google Cloud. Website origins are not required for the Android-only flow.

## Android build

```bash
npm install
npm run app:add-android
```

For an existing Android project:

```bash
npm install
npm run app:sync
```
