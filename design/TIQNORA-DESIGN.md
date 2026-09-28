# Tiqnora Front-End Design System 2.0

Status: Working design system for the Refero-inspired redesign  
Primary language: Arabic (RTL)  
Secondary language: English (LTR)  
Brand: Tiqnora AI

## 1. Design intent

Tiqnora should feel like a serious AI and digital systems company: precise, calm, modern, premium, and fast.

The interface should avoid "cyberpunk decoration for decoration's sake". Use one strong brand accent, dark engineered surfaces, thin structural borders, disciplined typography, product UI previews, and generous spacing.

The visual reference mix is inspired by patterns observed in:
- Linear — compact precision, hairline borders, restrained color
- Raycast — dark cockpit atmosphere, subtle glass navigation
- Checkly — deep navy + signal blue, mission-control feel
- Resend — near-black luxury, low-elevation surfaces
- Vercel — hierarchy through typography, whitespace, and contrast
- OpenAI — editorial restraint and text-first clarity
- Ramp — flat cards, disciplined 4px rhythm, minimal shadow

Do not reproduce another brand's proprietary identity, layout, artwork, or signature assets. Use references only as design principles.

## 2. Brand tokens

### Core colors

- `--tq-void: #030712` — deepest page background
- `--tq-midnight: #060B1E` — Tiqnora core navy
- `--tq-surface: #0B1224` — primary card/panel
- `--tq-surface-2: #101A31` — elevated/inset panel
- `--tq-blue: #0A5CFF` — primary brand action
- `--tq-cyan: #00D2FF` — signal/highlight only
- `--tq-white: #FFFFFF`
- `--tq-text: #F7FAFF`
- `--tq-text-soft: #AAB9CF`
- `--tq-muted: #72829B`
- `--tq-border: rgba(255,255,255,.09)`
- `--tq-border-strong: rgba(255,255,255,.16)`

### Color rules

1. Blue is the primary action color.
2. Cyan is a signal color, not a background paint.
3. Avoid multi-color gradients on cards and buttons.
4. Hero atmosphere may use a very subtle blue radial glow.
5. Most surfaces should be neutral navy/black with 1px borders.
6. Never make every icon, label, border, and title cyan.

## 3. Typography

Primary Arabic: IBM Plex Sans Arabic.  
English fallback: system UI / Inter-compatible sans.

Hierarchy:
- Hero display: clamp(44px, 6vw, 76px), weight 600-700, tight line height
- Section heading: clamp(30px, 4vw, 48px), weight 600
- Card heading: 18-22px, weight 600
- Body: 16-18px, weight 400
- Metadata / labels: 12-13px, weight 500-600, tracked lightly

Rules:
- Prefer hierarchy through size and contrast rather than excessive weight.
- Keep body copy readable and short.
- Use monospace only for technical labels/status metadata when useful.
- Arabic must remain visually balanced; do not copy Latin negative tracking values blindly.

## 4. Geometry

Base spacing unit: 4px.

Preferred rhythm:
- 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96 / 128
- Main max width: 1200-1240px
- Section vertical padding: 88-120px desktop, 64-80px mobile
- Card padding: 24-28px
- Grid gap: 16-24px

Radius vocabulary:
- Buttons / inputs: 8px
- Small cards: 12px
- Feature cards: 16px
- Large showcase panels: 20px
- Pills only for tags/status

Avoid giant 28-40px card radii.

## 5. Borders and elevation

The default elevation primitive is a hairline border, not a drop shadow.

Use:
- 1px rgba white border
- subtle inset highlight on important panels
- restrained backdrop blur for header only
- one soft shadow for floating product previews if needed

Avoid:
- heavy glow
- blue neon outlines on every component
- stacked shadows
- glassmorphism everywhere

## 6. Header

Desktop:
- fixed or sticky
- low-opacity dark background
- blur 14-18px
- 1px bottom border
- compact 64-68px height
- clear primary CTA
- preserve Shop, cart count, language toggle

Mobile:
- menu button with large tap target
- navigation drawer should be simple and fast
- cart and language remain accessible

## 7. Hero

Goal: communicate "Tiqnora builds connected digital systems" in the first screen.

Structure:
- eyebrow label
- one decisive headline
- 1 short supporting paragraph
- 2 CTAs maximum
- small trust/status row
- product/system preview instead of decorative particle art

Hero visual direction:
- "Tiqnora Command Center"
- large dark application frame
- internal status rows for AI agents, CRM, social, automation
- tiny live indicators
- restrained blue signal accents
- no fake metrics that imply real customer results

## 8. Homepage information architecture

1. Hero / Command Center preview
2. Connected systems overview
3. Product capability showcase
4. How Tiqnora works
5. Trust / engineering principles
6. Final CTA

The page should answer:
- What is Tiqnora?
- What can it build?
- Why is it different?
- What should the visitor do next?

## 9. System cards

Cards should:
- use dark neutral surfaces
- have 1px structural border
- include a small number / icon
- use one concise paragraph
- expose a clear action link
- move at most 2px on hover

Cards should not:
- glow
- scale aggressively
- use decorative gradients
- contain large paragraphs

## 10. Product UI previews

Use real Tiqnora concepts:
- AI Workforce
- CRM / Sales Center
- Social Inbox / Publishing
- Website Systems
- Store / Commerce
- Network & Security

Preview visuals should feel like lightweight product screenshots built with HTML/CSS, not generic illustrations.

## 11. Motion

Motion is functional.

Allowed:
- 150-220ms hover transitions
- subtle panel reveal
- small status pulse
- very slow hero ambient glow

Respect `prefers-reduced-motion`.

Avoid:
- infinite decorative transforms
- parallax that affects readability
- constant floating cards
- scroll-jacking

## 12. Accessibility

- visible keyboard focus
- WCAG-friendly contrast
- semantic headings
- buttons must remain buttons
- links must remain links
- minimum 44px mobile tap target where practical
- do not encode state by color alone
- RTL and LTR must both work

## 13. Performance

Target: fast first render on mobile.

Rules:
- CSS-first visuals
- no heavy animation libraries for marketing pages
- lazy-load non-critical images
- no autoplay background video in the hero
- avoid unnecessary font families
- keep above-the-fold DOM compact
- preserve existing SEO metadata and structured data

## 14. Commerce mode

Shop, product and checkout pages should become visually lighter and more commerce-first than the marketing homepage:
- brighter surfaces
- larger product imagery
- clear price / availability / shipping
- strong add-to-cart hierarchy
- minimal decorative effects

Do not force the full dark command-center look onto checkout.

## 15. Admin mode

Admin should use:
- compact 4px-based spacing
- 8-12px radii
- dense tables
- subtle borders
- status colors only when semantic
- no large marketing effects

Think precision control panel, not landing page.

## 16. CSS token starter

```css
:root {
  --tq-void: #030712;
  --tq-midnight: #060B1E;
  --tq-surface: #0B1224;
  --tq-surface-2: #101A31;
  --tq-blue: #0A5CFF;
  --tq-cyan: #00D2FF;
  --tq-text: #F7FAFF;
  --tq-text-soft: #AAB9CF;
  --tq-muted: #72829B;
  --tq-border: rgba(255,255,255,.09);
  --tq-border-strong: rgba(255,255,255,.16);
  --tq-radius-sm: 8px;
  --tq-radius: 12px;
  --tq-radius-lg: 16px;
  --tq-max: 1220px;
}
```

## 17. Homepage acceptance checklist

- Looks clearly like Tiqnora, not a clone of a reference brand
- Blue remains the dominant brand accent
- Arabic RTL feels intentional
- Header keeps shop/cart/language
- Existing SEO metadata stays intact
- Existing cart and language scripts remain functional
- Hero has a real product/system visual
- No fake customer logos or fabricated performance claims
- Mobile layout is clean at 360px+
- Reduced-motion is supported
- No new heavy dependencies
