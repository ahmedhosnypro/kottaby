# Dual-Representation DESIGN.md Specification

The `DESIGN.md` format pairs machine-readable YAML tokens with human-readable rationale to guide Stitch generation and enforce consistency.

---

## Format Specification

```markdown
---
name: "Acme Design System"
version: "1.0.0"
colors:
  primary: "#4F46E5"
  secondary: "#06B6D4"
  neutral-bg: "#0F172A"
  surface: "#1E293B"
  text-main: "#F8FAFC"
  text-muted: "#94A3B8"
  accent: "#F43F5E"
typography:
  font-family-headline: "Inter"
  font-family-body: "Inter"
  font-family-mono: "JetBrains Mono"
  scale:
    h1: "2.5rem"
    h2: "2.0rem"
    body: "1.0rem"
    caption: "0.875rem"
geometry:
  roundness: "8px" # ROUND_EIGHT
  border-width: "1px"
elevation:
  shadow-card: "0 4px 6px -1px rgb(0 0 0 / 0.1)"
---

# Design System: Acme Platform

## 1. Visual Theme & Atmosphere
Modern, technical, and data-dense. High-contrast dark surfaces with vibrant indigo accents that direct user focus to key calls to action.

## 2. Color Palette & Roles
- **Primary Indigo (`#4F46E5`):** Reserved for primary interactive controls, active tabs, and key metric callouts.
- **Secondary Cyan (`#06B6D4`):** Secondary actions, interactive graphs, and informational tags.
- **Dark Slate Surface (`#1E293B`):** Card backgrounds with subtle border dividers.

## 3. Typography & Hierarchy
- Headlines use bold Inter font with tight tracking (`tracking-tight`).
- Body copy uses regular weight Inter with comfortable reading line height.

## 4. Component Rules
- **Buttons**: Rounded-md (8px), solid indigo fill for primary, outlined surface for secondary.
- **Cards**: Dark slate background with 1px border (#334155), no heavy shadows.
- **Inputs**: 1px border, surface background, subtle ring glow on focus.

## 5. Do's and Don'ts
- **DO** use primary color sparingly for primary CTAs.
- **DON'T** mix different corner roundness scales in the same screen.
- **DO** maintain WCAG AA contrast for text and icon elements.
```
