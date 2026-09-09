# Hoviyat V3 Next Pass

## Completed in this pass
- Hardened message RPC execution grants.
- Removed anonymous execution from Secret Chat v3 and messaging send endpoints.
- Removed unused legacy Secret Chat sender overload execution.
- Removed legacy 6-argument group sender execution.
- Added Secret Chat peer-key change detection and visible warning state.
- Added authenticated `hoviyat-ai` Edge Function.
- Added browser-safe public API adapter (`HoviyatAPI`) for Open-Meteo weather/geocoding with short-lived memory cache.

## AI security model
- Browser sends only the user's authenticated session to the Edge Function.
- Provider credentials belong in Supabase Edge Function secrets, never in browser code.
- AI endpoint is JWT-protected.
- Inputs are bounded and sanitized before upstream calls.
- If no provider secret is configured, the feature remains functional through a deterministic local fallback.

## Remaining major tracks
1. Full UI replacement and responsive design system.
2. TypeScript + Vite migration in stages, preserving the current production app while modules are moved.
3. Resumable/TUS media uploads for large videos.
4. Full device-key model for Secret Chat, including key history and multi-device support.
5. Audit every remaining SECURITY DEFINER function and legacy overload.
6. Enable Supabase Leaked Password Protection in Auth settings.
7. Wire AI controls, API hub, security center, media gallery, and device management into the new UI.
