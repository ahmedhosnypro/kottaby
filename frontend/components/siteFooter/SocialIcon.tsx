"use client";

import { Box } from "@mui/material";
import type { ReactNode } from "react";

/** Inline SVG social icon — 16×16, filled with currentColor. */
export function SocialIcon({ children, label }: Readonly<{ children: ReactNode; label: string }>): ReactNode {
  return (
    <Box
      component="a"
      href="#"
      aria-label={label}
      sx={theme => ({
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 44,
        height: 44,
        borderRadius: 1,
        border: "1px solid rgba(255, 255, 255, 0.3)",
        color: "var(--mui-palette-onPrimary)",
        opacity: 0.7,
        textDecoration: "none",
        transition: "border-color 0.2s ease, color 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease",
        "&:hover": {
          borderColor: "var(--mui-palette-secondary-main)",
          color: "var(--mui-palette-secondary-light)",
          opacity: 1,
          // Soft copper glow ring riding alongside the existing border/color shift.
          boxShadow: `0 0 10px color-mix(in srgb, ${theme.palette.secondary.main} 45%, transparent)`,
        },
        // Keyboard parity with the hover affordance — crisp copper ring.
        "&:focus-visible": {
          outline: "2px solid var(--mui-palette-secondary-main)",
          outlineOffset: 2,
        },
      })}
    >
      {children}
    </Box>
  );
}
