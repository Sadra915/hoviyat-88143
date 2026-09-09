# HOVIYAT Design Context — 2026 Glass Identity

## Product
هویت is a Persian-first messaging product. The primary job is fast, trustworthy communication, with identity, private conversations, groups, channels, media, voice, and AI assistance around the conversation rather than competing with it.

## Visual thesis
**Quiet surfaces. Bright signal. One recognizable mark.**

The new identity is built around a translucent H-shaped chat mark: a conversation bubble whose internal form suggests the Persian/Latin idea of «H» without copying another messenger's logo or assets.

## Tokens
- Background dark: `#070B16`
- Panel dark: `#0D1322`
- Text dark: `#F4F7FF`
- Muted dark: `#91A0BA`
- Cyan: `#55D9FF`
- Blue: `#5B8CFF`
- Violet: `#8B6CFF`
- Magenta: `#D96CFF`
- Signature gradient: cyan → blue → violet → magenta
- Radius family: 14 / 18 / 22 / 28
- Motion: springy, short, purposeful; reduced-motion fallback required

## Layout
Desktop uses a calm glass shell with generous spacing and clear conversation hierarchy. Mobile uses a floating bottom navigation and compact glass composer. Cards are rounded but not pill-shaped by default.

## Interaction language
- Press: tiny scale-down
- Hover: 1–2px lift, subtle surface brightening
- Message entry: soft upward reveal
- Modal/sheet: spring entrance
- Composer focus: lift + restrained glow
- Presence: pulse only where state is meaningful
- Reduced motion: transitions/animations collapse to near-zero duration

## Accessibility
- Keyboard `:focus-visible` rings remain visible.
- Color is not the only status signal.
- `prefers-reduced-motion` is honored.
- Mobile safe-area behavior remains owned by existing app styles.

## Boundary
The redesign changes presentation and visual tokens, not the application's Supabase/security/business behavior.
