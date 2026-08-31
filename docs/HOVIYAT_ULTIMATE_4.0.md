# HOVIYAT ULTIMATE 4.0

This package is an additive upgrade over the supplied HOVIYAT_NEXT_FULL base. Existing auth/chat/groups/channels/call/voice/security/secretchat modules are preserved rather than replaced.

## Added capability set

The Ultimate Studio registers 40 capability surfaces covering AI, Secret Chat, motion, UX, storage, notifications, performance and accessibility.

## 20 new motion presets

1. emojiBurst
2. emojiFloat
3. emojiPop
4. messageFlow
5. reactionSpring
6. typingOrbit
7. sendTrail
8. searchMorph
9. modalSpring
10. tabSlide
11. themeBreathe
12. glassShimmer
13. scrollReactive
14. presencePulse
15. recordingWave
16. downloadProgress
17. mediaLightbox
18. notificationRise
19. fabSpin
20. iconWiggle

Animations use the browser Web Animations API where available and respect prefers-reduced-motion. See MDN Web Animations documentation for the underlying browser API.

## AI boundary

The UI/architecture for Hoviyat AI is included. It does NOT silently send private chat contents to a third-party AI provider. A real provider must be connected through a server-side integration and explicit user action.

## Secret Chat boundary

The existing secret-chat cryptographic/data layer is not replaced by this additive package. The new Secret Chat center controls presentation and preferences. The SQL migration stores only user preferences and does not alter existing encrypted message storage.

## SQL

Run `supabase/final/001_hoviyat_ultimate_preferences.sql` after the existing migrations. It is intentionally isolated and uses RLS so users can only access their own preference rows.

## Web references

The motion layer follows the browser Web Animations API model documented by MDN, including Element.animate(), playback control and reduced-motion guidance. See: https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API

No third-party emoji or proprietary messenger assets were copied into this package. Native Unicode emoji and browser animation primitives are used instead.
