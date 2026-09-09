# Hoviyat Release 2026

## Included

- New Settings Control Center with search, dashboard status, quick actions and categorized pages.
- Security Center retained and wired to real session/security data.
- Privacy Center backed by Supabase.
- Storage usage telemetry backed by a server-side RPC.
- AI settings backed by per-user preferences.
- Google Login buttons for messenger and admin.
- Native OAuth deep-link handling for messenger and admin.
- Voice Assistant action in the existing Hoviyat AI header panel.
- Supabase Edge Function `hoviyat-voice` for authenticated speech-to-text + AI response.
- Improved call controls including camera switching and speaker support when the WebView exposes `setSinkId`.
- Hoviyat logo image supplied for the release app icons, resized and compressed.
- Messenger and Admin are physically separated into independent packages.
- Production dist folders are generated separately.
- RLS auth checks were rewritten to use initplan-friendly `(select auth.uid())` patterns where applicable.
- Additional message/story/privacy/session indexes and server-side guards were added.

## Deliberately not faked

- AI Memory is not presented as an active feature because a full user-facing memory lifecycle is not implemented in this release.
- Large-media selective deletion UI is not presented until a complete server-side deletion workflow is wired.
- 2FA, App Lock, biometric and recovery-code controls use the existing real security layer rather than being duplicated as decorative settings.

## Manual release configuration still required

1. Enable/configure Google provider in Supabase with the real Google OAuth credentials.
2. Set Supabase Site URL and Additional Redirect URLs.
3. Configure the production AI secret/model values for `hoviyat-ai` and `hoviyat-voice` if not already configured.
4. Build fresh APKs after the Android deep-link manifest patch is applied.
5. Enable Supabase leaked-password protection in Auth security settings. The current project advisor still reports it as disabled.
