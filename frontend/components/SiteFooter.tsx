"use client";

import { Box, Container, Divider, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { FooterBrandSection } from "@/frontend/components/siteFooter/FooterBrandSection";
import { FooterLinksSection } from "@/frontend/components/siteFooter/FooterLinksSection";
import { Landing, useAppTranslation } from "@/shared/locale";

/**
 * SiteFooter - shared footer for the landing page and auth layout.
 *
 * Shows the brand wordmark + tagline, a row of social media icon buttons,
 * and three columns of links (Product / Company / Legal). A copper divider
 * separates the footer body from the copyright line.
 *
 * Design (Midnight Blue + Copper brand):
 *  - Background: `primary.dark` (deepest midnight blue) for visual weight.
 *  - Text: `onPrimary` with opacity tiers.
 *  - Copper accent: the top border, the brand wordmark dot, and social icon hovers.
 *  - Subtle radial gradient overlay in the top-right corner (copper, very low opacity).
 *
 * Section sub-components live in `frontend/components/siteFooter/`
 * (FooterBrandSection, FooterLinksSection, SocialIcon + brand glyphs,
 * FooterColumn, FooterLink).
 *
 * Client component - needs `useAppTranslation(Landing)` for bilingual copy.
 */
export function SiteFooter(): ReactNode {
  const t = useAppTranslation(Landing);

  return (
    <Box
      component="footer"
      sx={{
        mt: "auto",
        bgcolor: "var(--mui-palette-primary-dark)",
        color: "var(--mui-palette-onPrimary)",
        borderTop: "3px solid var(--mui-palette-secondary-main)",
        boxShadow: "inset 0 3px 12px rgba(184,115,51,0.15)",
        position: "relative",
        overflow: "hidden",
        // Hairline craft: a 1px inner white line floating 3px below the 3px
        // copper border adds quiet depth without any shimmer/motion.
        // (`"1px"` string — MUI sizing maps the bare number 1 to 100%.)
        "&::after": {
          content: '""',
          position: "absolute",
          top: 6,
          insetInlineStart: 0,
          insetInlineEnd: 0,
          height: "1px",
          background: "color-mix(in srgb, var(--mui-palette-common-white) 6%, transparent)",
          pointerEvents: "none",
        },
      }}
    >
      {/* Subtle radial gradient overlay - top-right corner, copper at very low opacity */}
      <Box
        aria-hidden="true"
        sx={{
          position: "absolute",
          top: -80,
          right: -80,
          width: 320,
          height: 320,
          borderRadius: "50%",
          background: "radial-gradient(circle, var(--mui-palette-secondary-main) 0%, transparent 70%)",
          opacity: 0.05,
          pointerEvents: "none",
        }}
      />

      <Container maxWidth="lg" sx={{ py: { xs: 4, md: 6 }, position: "relative" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 4, md: 8 }}
          sx={{ alignItems: { md: "flex-start" } }}
        >
          {/* Brand + tagline */}
          <FooterBrandSection />

          {/* Link columns — three-across from md up so the 60% zone is
              balanced instead of stacking tall single columns. */}
          <FooterLinksSection />
        </Stack>

        <Divider
          sx={{
            mt: 4,
            borderColor: "currentColor",
            opacity: 0.12,
          }}
        />

        <Typography variant="caption" sx={{ display: "block", mt: 2, textAlign: "center", opacity: 0.75 }}>
          {t.footerCopyright}
        </Typography>
      </Container>
    </Box>
  );
}
