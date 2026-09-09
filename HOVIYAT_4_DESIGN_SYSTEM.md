# HOVIYAT 4 — Glass Identity Design System

## Direction
A dark-first, Persian-first messenger identity using navy/indigo glass surfaces and a cyan-blue-violet-magenta signal gradient. The generated H-shaped chat mark is the signature; surrounding UI is intentionally quieter.

## Component language
- **Shell:** translucent topbar, glass panels, soft atmospheric background.
- **Conversation cards:** 20px desktop / 17px mobile, quiet default state, lifted hover state.
- **Messages:** translucent neutral bubbles and blue-violet sent bubbles.
- **Composer:** floating glass tray with a gradient send action.
- **Settings:** stacked glass rows with small movement on hover.
- **Auth:** centered glass card with oversized brand mark.
- **Secret Chat:** same shell with a violet security atmosphere.

## Motion
Animations are short and state-driven. The visual system avoids constant spectacle. `prefers-reduced-motion: reduce` disables meaningful movement.

## SPARK review (design-only)
- **S — Simple: 4/5:** the visual hierarchy is intentionally reduced to shell → conversation → composer; no workflow behavior was changed.
- **P — Purposeful & Prioritized: 4/5:** the conversation remains the dominant surface and the signature mark is limited to brand touchpoints.
- **A — Attractive & Attentive: 5/5:** signature icon, glass sheen, spring sheets, message entrance, composer focus, and tactile buttons provide distinct micro-moments.
- **R — Reliable: 4/5:** visual fallback includes reduced-motion and power-saving rules; browser-level visual QA remains a next verification step.
- **K — Known: 4/5:** messaging patterns remain familiar while the visual identity is original rather than a Telegram clone.

**Design score: 21/25 — Focused iteration.**

## Implementation boundary
This pass is CSS/assets-first so existing app behavior and security-sensitive JS remain untouched. FLOWSTACK was consulted for layer selection; the installed project has no FLOWSTACK package dependency, so the runtime implementation remains application-owned rather than pretending an unavailable package is installed.
