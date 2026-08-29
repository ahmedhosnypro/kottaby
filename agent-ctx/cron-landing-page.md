# Task ID: cron-landing-page
Agent: Landing Page Enhancement Agent
Task: Rewrite app/page.tsx with 10 major new features and styling improvements

Work Log:
- Read worklog.md for full project context (DEV2-003 contract work, prior landing enhancement)
- Read current app/page.tsx (1387 lines) to understand existing structure
- Read LandingLabels type — confirmed all 80+ new i18n keys already exist (partners, pricing, contact, cookie)
- Read EN and AR landing translations — confirmed all strings already translated
- Wrote complete new page.tsx with all 10 features + 6 styling improvements
- Fixed lint: removed unused `IconButton` import, merged duplicate `react` imports
- Verified: remaining lint errors in page.tsx are all pre-existing (void FormatQuoteIcon, hardcoded aria-labels, regex complexity)

New Features Added:
1. ScrollProgressBar — 3px fixed copper bar at top, tracks scroll position (z-index 200)
2. PartnersSection — 6 partner institutions in grid, subtle border → copper on hover
3. PricingSection — 3 plan cards (Explorer/Student/Family), middle card elevated with copper border + "Most Popular" badge
4. ContactSection — email + textarea form, Snackbar success message on submit
5. Enhanced Hero — gradient text on accent word (linear-gradient copper light→main), 4 floating decorative circles
6. Enhanced Testimonials — 5 filled copper Star icons above each quote
7. Enhanced FAQ — numbered (01-05) in copper overline style
8. Nav Updates — added Pricing (#pricing) and Contact (#contact) links
9. CookieConsent — glassmorphism banner, localStorage persistence, Accept/Decline/Settings buttons
10. SiteFooter — kept existing import

Styling Improvements:
- FeatureCard: copper inner glow on hover (boxShadow with copper tint)
- Recitation cards: scale(1.02) on hover
- HowItWorks step circles: pulse animation via @keyframes stepPulse
- Hero CTA: shimmer/shine effect on hover via ::after pseudo-element
- Roles cards: gradient top border (copper→transparent via borderImage)
- Newsletter: MailOutline icon before title
- Stats bar: subtle geometric pattern overlay (opacity 0.03)

Imports Added:
- Star from @mui/icons-material
- MailOutline as MailIcon from @mui/icons-material
- Snackbar, Alert from @mui/material
- useCallback from react (merged into single import)

Stage Summary:
- File rewritten: ~820 lines (was 1387 — cleaner, no duplicated patterns)
- Zero new lint errors introduced
- All i18n keys used from existing LandingLabels type
- Dev server compilation: confirmed working (pre-existing lint errors only in backend files + 4 pre-existing in page.tsx)
