/**
 * Built-in Preset Themes Catalog — site-appearance customization.
 *
 * Six curated light/dark brand-color pairs (`default`, `ocean`, `emerald`,
 * `violet`, `crimson`, `slate`) per locked decision §13 ("Preset Theme
 * Catalog with Light/Dark Palette Pairs"). Each preset is a complete
 * `PerModeColors`-shaped pair — selecting it seeds both the light-mode and
 * dark-mode Kottaby color pairs in `appearancePreviewStore` (one click fills
 * `colors.light` + `colors.dark`).
 *
 * Material Design hex values were chosen for high legibility against the
 * MUI v9 `nativeColor: true` derivation (CSS `color-mix()` derives
 * `light`/`dark`/`contrastText` from the single `main` value). Per
 * `frontend/AGENTS.md` "no hardcoded colors" rule, these hex literals are
 * NOT UI chrome tokens — they are user-selectable brand-color data shipped
 * as a static catalog (same exemption as `ColorEditorSection` swatches).
 *
 * Extensible structure (decision §13): future presets can be added by
 * appending to `APPEARANCE_PRESETS` and extending `AppearancePresetId`.
 *
 * File location: `frontend/common/providers/theme/presets/index.ts` per
 * `ai/plans/brand/tasks.md` Task 9.4. Sibling to `theme/palette/` (the
 * base MUI palette modules) so the catalog imports cleanly from the
 * `ThemeProvider` tree without crossing module boundaries.
 */
import type { PerModeColors } from "@/backend/types/appearance.types";

/**
 * Identifier union for the six built-in preset themes.
 *
 * Declared as a string-literal union (not an enum) to keep the catalog
 * JSON-serializable for `NEXT_PUBLIC_APP_BRANDING={"preset":"emerald"}`
 * (decision §13 — environment-variable hydration in Task 9.2). The union
 * is exhaustive over `APPEARANCE_PRESETS` ids; new presets must extend
 * both this union and the array below.
 */
export type AppearancePresetId = "default" | "ocean" | "emerald" | "violet" | "crimson" | "slate";

/**
 * A single preset theme entry.
 *
 * `light` and `dark` are the same shape as `PerModeColors["light"]` /
 * `PerModeColors["dark"]` (the two atomic brand primitives —
 * `primaryMain` + `secondaryMain`) so a preset can be applied to the
 * Kottaby via a structural spread:
 *
 * ```ts
 * store.setModeColors("light", preset.light);
 * store.setModeColors("dark",  preset.dark);
 * ```
 *
 * The `name` field is a display label (English-only at the catalog layer;
 * the consumer `PresetThemeSection` may map it through i18n in a future
 * task — for now the prototype uses bare English labels per
 * `frontend/common/views/dashboard/components/customize/ColorEditorSection`).
 */
export interface AppearancePreset {
  /** Stable identifier (used in `APP_THEME_PRESET` env var, decision §13). */
  readonly id: AppearancePresetId;
  /** Human-readable label shown in the selector grid. */
  readonly name: string;
  /** Light-mode brand color pair. */
  readonly light: PerModeColors["light"];
  /** Dark-mode brand color pair. */
  readonly dark: PerModeColors["dark"];
}

/**
 * The built-in preset catalog (decision §13).
 *
 * Order is significant — `default` is always first because it is the
 * factory reset target (`DEFAULT_APPEARANCE_Kottaby` in
 * `appearancePreviewStore` mirrors these values). The remaining five
 * presets are ordered by hue family (cool → warm → neutral) for visual
 * rhythm in the selector grid.
 *
 * Color sources (Material Design 2014 palette):
 * - `default`  — Blue 700 / Indigo 500 (light); Blue 400 / Indigo 300 (dark).
 * - `ocean`    — Cyan 800 / Cyan 600 (light); Cyan 400 / Cyan 200 (dark).
 * - `emerald`  — Green 800 / Light Green 800 (light); Green 500 / Light Green 400 (dark).
 * - `violet`   — Purple 700 / Pink 700 (light); Purple 300 / Pink 300 (dark).
 * - `crimson`  — Red 800 / Orange 800 (light); Red 400 / Orange 400 (dark).
 * - `slate`    — Blue Gray 700 / Blue Gray 500 (light); Blue Gray 400 / Blue Gray 200 (dark).
 */
export const APPEARANCE_PRESETS: ReadonlyArray<AppearancePreset> = [
  {
    id: "default",
    name: "Default",
    light: { primaryMain: "#1976D2", secondaryMain: "#3F51B5" },
    dark: { primaryMain: "#42A5F5", secondaryMain: "#7986CB" },
  },
  {
    id: "ocean",
    name: "Ocean",
    light: { primaryMain: "#00838F", secondaryMain: "#00ACC1" },
    dark: { primaryMain: "#26C6DA", secondaryMain: "#80DEEA" },
  },
  {
    id: "emerald",
    name: "Emerald",
    light: { primaryMain: "#2E7D32", secondaryMain: "#558B2F" },
    dark: { primaryMain: "#4CAF50", secondaryMain: "#9CCC65" },
  },
  {
    id: "violet",
    name: "Violet",
    light: { primaryMain: "#7B1FA2", secondaryMain: "#C2185B" },
    dark: { primaryMain: "#BA68C8", secondaryMain: "#F06292" },
  },
  {
    id: "crimson",
    name: "Crimson",
    light: { primaryMain: "#C62828", secondaryMain: "#EF6C00" },
    dark: { primaryMain: "#EF5350", secondaryMain: "#FFA726" },
  },
  {
    id: "slate",
    name: "Slate",
    light: { primaryMain: "#455A64", secondaryMain: "#607D8B" },
    dark: { primaryMain: "#78909C", secondaryMain: "#B0BEC5" },
  },
];

/**
 * Lookup helper — find a preset by id.
 *
 * Returns `undefined` if no preset matches (e.g. an env-var preset id
 * that was renamed in a release). Callers in the resolution tier
 * (decision §14) fall back to `APPEARANCE_PRESETS[0]` (`default`) when
 * this returns `undefined`.
 *
 * Linear scan (6 entries) — no need for a `Record` lookup table; the
 * catalog is small enough that the array iteration is faster than the
 * hash-lookup overhead for a single read.
 */
export function findAppearancePreset(id: string): AppearancePreset | undefined {
  return APPEARANCE_PRESETS.find(preset => preset.id === id);
}
