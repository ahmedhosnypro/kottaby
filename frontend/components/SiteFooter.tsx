"use client";

import { Box, Container, Divider, Link as MuiLink, Stack, Typography } from "@mui/material";
import Link from "next/link";
import type { ReactNode } from "react";
import { ApiStatusIndicator } from "@/frontend/components/ApiStatusIndicator";
import { Landing, useAppTranslation } from "@/shared/locale";

/** Inline SVG social icon — 16×16, filled with currentColor. */
function SocialIcon({ children, label }: Readonly<{ children: ReactNode; label: string }>): ReactNode {
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

/** X (Twitter) bird logo — simplified path. */
function XIcon(): ReactNode {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/** YouTube play button in rounded rectangle. */
function YoutubeIcon(): ReactNode {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12z" />
    </svg>
  );
}

/** Instagram camera icon. */
function InstagramIcon(): ReactNode {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z" />
    </svg>
  );
}

/** Telegram paper plane icon. */
function TelegramIcon(): ReactNode {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0h-.056zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

/** Facebook f letter icon. */
function FacebookIcon(): ReactNode {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

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
          <Stack spacing={1.5} sx={{ flex: { md: "1 1 40%" } }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <Box
                aria-hidden
                sx={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  bgcolor: "var(--mui-palette-secondary-main)",
                }}
              />
              <Typography sx={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.01em" }}>Kottaby Academy</Typography>
            </Stack>
            <Typography variant="body2" sx={{ maxWidth: 320, lineHeight: 1.6, opacity: 0.7, fontSize: 13 }}>
              {t.footerTagline}
            </Typography>

            {/* Social media icons row */}
            <Stack direction="row" spacing={1.5} sx={{ mt: 1 }}>
              <SocialIcon label={t.footerSocialX}>
                <XIcon />
              </SocialIcon>
              <SocialIcon label={t.footerSocialYoutube}>
                <YoutubeIcon />
              </SocialIcon>
              <SocialIcon label={t.footerSocialInstagram}>
                <InstagramIcon />
              </SocialIcon>
              <SocialIcon label={t.footerSocialTelegram}>
                <TelegramIcon />
              </SocialIcon>
              <SocialIcon label={t.footerSocialFacebook}>
                <FacebookIcon />
              </SocialIcon>
            </Stack>

            {/* Live API status chip — ops-grade detail under the social rail */}
            <ApiStatusIndicator />
          </Stack>

          {/* Link columns — three-across from md up so the 60% zone is
              balanced instead of stacking tall single columns. */}
          <Stack
            direction={{ xs: "row", sm: "column", md: "row" }}
            spacing={{ xs: 5, sm: 3, md: 6 }}
            sx={{
              flex: { md: "1 1 60%" },
              flexWrap: "wrap",
              justifyContent: { xs: "flex-start", sm: "flex-end", md: "space-between" },
            }}
          >
            <FooterColumn title={t.footerProduct}>
              <FooterLink href="/register">{t.footerProductFeatures}</FooterLink>
              <FooterLink href="/register">{t.footerProductRecitations}</FooterLink>
              <FooterLink href="/register">{t.footerProductPricing}</FooterLink>
            </FooterColumn>
            <FooterColumn title={t.footerCompany}>
              <FooterLink href="/register">{t.footerCompanyAbout}</FooterLink>
              <FooterLink href="/register">{t.footerCompanyCareers}</FooterLink>
              <FooterLink href="/register">{t.footerCompanyContact}</FooterLink>
            </FooterColumn>
            <FooterColumn title={t.footerLegal}>
              <FooterLink href="/register">{t.footerLegalPrivacy}</FooterLink>
              <FooterLink href="/register">{t.footerLegalTerms}</FooterLink>
              <FooterLink href="/register">{t.footerLegalCookies}</FooterLink>
            </FooterColumn>
          </Stack>
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

/** A single footer link column with a copper-underscored heading. */
function FooterColumn({ title, children }: Readonly<{ title: string; children: ReactNode }>): ReactNode {
  return (
    <Stack spacing={1.5}>
      <Typography
        variant="overline"
        sx={{
          fontWeight: 700,
          letterSpacing: "0.1em",
          // On the midnight footer, dimmed theme text can fall below WCAG AA
          // (MUI Link defaults to primary.main — near-invisible on primary.dark).
          // Pin the tint to onPrimary so contrast holds in both color schemes.
          opacity: 0.8,
          lineHeight: 1,
          pb: 0.5,
          borderBottom: "2px solid var(--mui-palette-secondary-main)",
          display: "inline-block",
          width: "fit-content",
        }}
      >
        {title}
      </Typography>
      {children}
    </Stack>
  );
}

/** A single footer link - subtle hover lift with slight translateX + copper color on hover. */
function FooterLink({ href, children }: Readonly<{ href: string; children: ReactNode }>): ReactNode {
  return (
    <MuiLink
      component={Link}
      href={href}
      underline="none"
      sx={{
        fontSize: 13,
        // Explicit onPrimary — MuiLink's default primary.main color measured
        // ~1.6:1 against the primary-dark footer in dark scheme.
        color: "var(--mui-palette-onPrimary)",
        opacity: 0.85,
        transition: "opacity 0.15s ease, color 0.15s ease, transform 0.15s ease",
        // Block-level + flex centering so the link occupies a 44px-tall touch
        // target (WCAG AAA 2.5.5) without changing the visible text size.
        display: "flex",
        alignItems: "center",
        minHeight: 44,
        boxSizing: "border-box",
        "&:hover": {
          opacity: 1,
          color: "var(--mui-palette-secondary-light)",
          transform: "translateX(3px)",
        },
        // Keyboard users get the same copper cue as the hover state.
        "&:focus-visible": {
          outline: "2px solid var(--mui-palette-secondary-main)",
          outlineOffset: 2,
          borderRadius: 0.5,
        },
      }}
    >
      {children}
    </MuiLink>
  );
}
