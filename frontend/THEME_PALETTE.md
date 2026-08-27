# Material 3 Theme Palette

This document summarizes the changes made to the theme palette to align with Material 3 standards and MUI requirements.

## New Structure

The palette has been refactored to support a flattened Material 3 "Color Family" structure while maintaining compatibility with MUI's standard palette objects.

### 1. Standard MUI Families (Object + Siblings)
The following families are implemented as MUI `PaletteColor` objects but also have their Material 3 siblings available at the top level of the palette:
- `primary`, `secondary`, `error`, `warning`, `info`, `success`

**Access Patterns:**
- `theme.palette.primary.main` (MUI Standard - **Always prefer `.main`**)
- `theme.palette.onPrimary` (M3 Sibling - **Replaces `contrastText`**)
- `theme.palette.primaryContainer`
- `theme.palette.onPrimaryContainer`

### 2. Custom & Layout Families (Flattened)
These families are fully flattened:
- `tertiary`, `header`, `footer`, `sidebar`

**Access Patterns:**
- `theme.palette.header` (Base Color String)
- `theme.palette.onHeader`

### 3. Status Families (Sub-object Flattened)
- `pending`, `confirmed`, `active`, `completed`, `cancelled`, `blocked`

### 4. Base Scheme (Standard M3)
Direct access to all standard Material 3 scheme properties from `Color.kt`:
- `background`, `surface`, `surfaceVariant`, `outline`, `outlineVariant`, `scrim`, etc.
- `surfaceContainerLowest` to `surfaceContainerHighest`

---

## CRITICAL IMPLEMENTATION RULES

1.  **No Quotes**: Never use MUI's string-based palette access (e.g., `color="primary.main"` or `sx={{ color: 'primary.main' }}`).
2.  **Theme Function**: Use the theme callback pattern ONLY when theme-specific values are needed:
    - `sx={(theme) => ({ color: theme.palette.primary.main })}`
    - If no theme values are used, use a plain object: `sx={{ display: 'flex' }}`
3.  **NO DELETION**: Never delete an existing theme value (like `boxShadow` or `border`) if it's missing from your context. **Map it** to the most appropriate theme property.
    - e.g. `boxShadow: theme => theme.palette.shadow.card` (Restored property)
4.  **No `contrastText`**: Do NOT use `palette.primary.contrastText`. Instead, use the corresponding M3 `on<Color>` property (e.g., `theme.palette.onPrimary`).
5.  **Universal Contrast**: The M3 `on<Color>` property is designed to provide legibility across `main`, `light`, and `dark` tones of that family.
6.  **Container Contrast**: Use `on<Color>Container` specifically for `Container` variants.
7.  **Background Access**: Use `theme.palette.background.default` or `theme.palette.background.paper`.
8.  **No Hardcoded Hex/RGB**: All colors MUST come from `theme.palette`.

---

## Layout Properties (Restored)
The following properties have been restored to the theme to support the application's layout system:
- **`theme.palette.border`**: `light`, `main`
- **`theme.palette.shadow`**: `card`, `cardHover`, `button`, `buttonHover`

---

## Standard MUI Utility Families (M3-Aligned)

The following families are NOT redefined in `lightPalette.ts` / `darkPalette.ts` — they fall back to MUI's defaults derived from the rest of the palette. They are documented here because they are heavily used across the codebase and interact with the M3 surface/contrast model. All four families are accessed via the theme callback pattern, e.g. `sx={(theme) => ({ color: theme.palette.text.secondary })}`.

### `text` — Text Contrast Tokens

MUI's standard text-color family. These are the M3 "onSurface" equivalents for typography and are derived by MUI from `palette.text` based on the active mode.

| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `theme.palette.text.primary` | `rgba(0, 0, 0, 0.87)` | `#fff` | Highest-emphasis text — body copy, headings, labels |
| `theme.palette.text.secondary` | `rgba(0, 0, 0, 0.6)` | `rgba(255, 255, 255, 0.7)` | Medium-emphasis text — captions, helper, secondary info |
| `theme.palette.text.disabled` | `rgba(0, 0, 0, 0.38)` | `rgba(255, 255, 255, 0.5)` | Disabled-state text |

**Usage counts** (`frontend/` + `app/`): `primary` 24, `secondary` 271, `disabled` 13 → **308 total**.

**Where used:** Almost every typography component that needs to convey surface-relative emphasis. `secondary` is by far the most common (helper text, subtitles, captions).

**M3 recommendation:** For **new** code, prefer the M3 explicit `onSurface` / `onSurfaceVariant` tokens when the text sits on a known surface (they are theme-driven and surface-aware). `text.*` remains valid and is the standard MUI mechanism — it is not an anti-pattern. Use `text.*` when you want MUI's automatic mode-driven contrast and do not need to bind to a specific M3 surface role.

### `action` — Interaction-State Overlay Colors

MUI's standard family for hover/selected/disabled/active/focus overlays. These map directly to Material 3 **state-layer** colors and ARE the M3-preferred tokens for clickable component overlays.

| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `theme.palette.action.hover` | `rgba(0, 0, 0, 0.04)` | `rgba(255, 255, 255, 0.08)` | Hover overlay on neutral surfaces |
| `theme.palette.action.selected` | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.16)` | Selected/toggle overlay on neutral surfaces |
| `theme.palette.action.disabled` | `rgba(0, 0, 0, 0.26)` | `rgba(255, 255, 255, 0.3)` | Disabled icon/fill color |
| `theme.palette.action.active` | `rgba(0, 0, 0, 0.54)` | `#fff` | Active icon color (rarely overridden) |
| `theme.palette.action.focus` | `rgba(0, 0, 0, 0.12)` | `rgba(255, 255, 255, 0.12)` | Focus overlay |

**Usage counts:** `hover` 19, `selected` 8, `disabled` 1, `active` 0, `focus` 0 → **28 total**.

**Where used:** Any clickable component needing a neutral state-layer background (IconButtons, List items, cards, toggle chips, row hover, etc.). Typical pattern:

```ts
sx={(theme) => ({ backgroundColor: theme.palette.action.hover })}
```

**M3 recommendation:** `action.*` IS the M3 state-layer mechanism for neutral components. Prefer it for generic clickable overlays. For components bound to a specific color role (e.g., primary-action buttons), use the role's container/`on*Container` tokens instead. `action.active` and `action.focus` are not currently used in this codebase — they remain available per MUI defaults.

### `divider` — Divider & Border Color

A single-token MUI standard family for divider lines and default borders. Aligned with the M3 **outlineVariant** role.

| Token | Light Value | Dark Value | Purpose |
|-------|-------------|------------|---------|
| `theme.palette.divider` | `rgba(0, 0, 0, 0.12)` | `rgba(255, 255, 255, 0.12)` | Hairline separators, default borders, `Divider` component |

**Usage count:** **33** occurrences across `frontend/` + `app/`.

**Where used:** MUI's `<Divider>` component defaults to this token; also used directly for `borderColor` on cards, table rows, and section separators.

**M3 recommendation:** For new code that needs a theme-aware outline on a known surface, prefer the explicit M3 `outlineVariant` token (which is defined in both palettes). `divider` is fine for MUI default component styling and neutral separators — it is not an anti-pattern. Avoid `divider` when you intend a strong structural border — use `theme.palette.border.main` instead.

### `common` — Absolute-Color Tokens (ANTI-PATTERN)

MUI's `common.white` / `common.black` are absolute, non-themeable colors. They bypass the entire M3 theming and contrast system.

| Token | Value (both modes) | Purpose |
|-------|-------------------|---------|
| `theme.palette.common.white` | `#fff` | Pure white — absolute |
| `theme.palette.common.black` | `#000` | Pure black — absolute |

**Usage count:** **0** occurrences. This family is documented for awareness only — it must NOT be re-introduced.

> **⚠️ WARNING — Anti-pattern per AGENTS.md M3 rule.**
> `common.*` is hardcoded absolute color and violates the project's "No Hardcoded Hex/RGB" rule (Rule 8) and the M3 `on<Color>` contrast model (Rules 4–6). It does NOT adapt to light/dark mode and will produce illegible text on light surfaces. **RARELY — effectively never — use it.** Prefer the M3 `on<Color>` siblings: `onPrimary`, `onSecondary`, `onSurface`, `onBackground`, etc. These are designed to provide legibility across their family's `main`/`light`/`dark` tones in both modes.

**Historical note:** A single `theme.palette.common.white` usage previously existed at `frontend/views/dashboard/teachers/onboarding/TeacherOnboardingView.tsx:49` (banner text on a `scrim` gradient). An audit flagged it for removal; it has since been replaced with the theme-aware `theme.palette.onSurface`. Future readers should NOT re-introduce `common.white` there — `onSurface` (or `onScrim` if added later) is the correct contrast-safe token for text over a scrim.
