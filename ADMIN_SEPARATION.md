# Hoviyat Release 2026 — physical app separation

Messenger and Admin are shipped as two independent source packages.

- Messenger root: `index.html`, `js/`, `css/`, `assets/`
- Admin package: `admin-panel/`
- Messenger build excludes admin runtime JavaScript.
- Admin has its own Capacitor config and Android deep-link scheme.
- Admin authorization is enforced by Supabase `is_admin()` in addition to the client gate.
