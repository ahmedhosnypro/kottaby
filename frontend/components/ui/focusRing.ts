import type { CSSObject } from "@mui/material/styles";

/**
 * Shared keyboard-focus indicator for raw MUI controls (audit-R4).
 *
 * Why it exists: MUI v9 ButtonBase ships no focus-visible styling — plain
 * IconButtons and Buttons rendered with NO visible keyboard ring
 * (`outline:none`; the default `.Mui-focusVisible` fill measured ≈1.1:1
 * against the auth panel background), failing WCAG 2.4.7 on every auth
 * surface. Copper (`secondary.main`) ring so the affordance matches the
 * brand accent; theme-token driven so light/dark both resolve.
 *
 * Kept in a standalone module so component files stay
 * react-refresh/only-export-components clean.
 */
export const focusVisibleRingSx = {
  "&:focus-visible, &.Mui-focusVisible": {
    outline: "2px solid",
    outlineColor: "var(--mui-palette-secondary-main)",
    outlineOffset: 2,
  },
} satisfies CSSObject;
