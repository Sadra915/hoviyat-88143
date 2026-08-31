# HOVIYAT V11 — Navigation/Layout Bugfix

## Fixed
- Mobile/WebView `display: flex !important` rules could override the HTML `hidden` attribute.
- Centralized View navigation now updates `hidden`, `aria-hidden`, and `appShell[data-chat-open]` together.
- Phone/WebView conversation mode is a full-viewport single-pane layout.
- Home, FAB, and bottom navigation cannot overlay an open conversation on mobile/WebView.
- Secret List and Secret Chat now use the same central navigation state.
- Removed the duplicate `pointerup` + `click` activation path for chat cards; click remains keyboard accessible.
- Conversation View is opened before network data finishes loading, so slow Supabase calls cannot prevent navigation.

## Verification
- All JavaScript files pass `node --check`.
- `tests/navigation-regression.mjs` => `NAV-REGRESSION PASS`.
- Duplicate DOM IDs were not introduced by this patch.
- Full interactive browser/WebView testing is still required on a real Android device; this environment cannot honestly claim that test.
