/**
 * Appearance / theme customization types.
 *
 * Used by `frontend/providers/theme/presets/` (the built-in preset catalog)
 * and the appearance-preview store (future brand-customization tickets).
 *
 * Kept minimal — the full appearance management UI is future work; these
 * types are the structural contract the preset catalog needs.
 */

/**
 * Brand-color pair for a single mode (light OR dark).
 * `primaryMain` + `secondaryMain` are the two atomic brand primitives
 * (Material Design hex values; MUI v9 `nativeColor: true` derives the
 * remaining palette steps from them).
 */
export interface ModeColors {
  readonly primaryMain: string;
  readonly secondaryMain: string;
}

/**
 * Light + dark mode brand-color pairs.
 */
export interface PerModeColors {
  readonly light: ModeColors;
  readonly dark: ModeColors;
}
