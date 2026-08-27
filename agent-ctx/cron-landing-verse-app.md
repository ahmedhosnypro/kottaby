# Task ID: cron-landing-verse-app
Agent: Landing Verse & App Section Agent
Task: Add VerseSection and MobileAppSection to landing page

Work Log:
- Read worklog.md for full project context
- Read current app/page.tsx (~2132 lines) to understand structure
- Verified i18n type already has verse/app keys (verseBadge, verseArabic, etc.)
- Added navVerse and navApp to LandingLabels type
- Added navVerse/navApp EN translations ("Verse" / "Get the App")
- AR translations already existed (no changes needed)
- Added PhoneAndroid and PhoneIphone icon imports
- Added navVerse/navApp as first two entries in navLinks array
- Added VerseSection component after HeroSection (not in FadeInBox)
- Added MobileAppSection with IslamicDivider between Contact and CTA
- Fixed TS 6.0 parse issue: condensed multi-line phone mockup JSX to single-line elements
- Verified: tsc --noEmit passes with zero errors

New Components:
1. VerseSection — midnight-blue gradient (200deg), geometric pattern overlay (0.05 opacity), copper radial glow on left, centered badge + decorative line + Arabic verse + translation + reference
2. MobileAppSection — 2-column grid, CSS-only phone mockup (rotate(-3deg), notch, gradient header, copper accent line, 3 placeholder screens), 4 feature items with CheckIcon, 2 app store buttons (PhoneIphone + PhoneAndroid)

Changes:
- shared/locale/types/landing/index.ts: +2 fields (navVerse, navApp)
- shared/locale/en/landing/index.ts: +2 translations (navVerse, navApp)
- app/page.tsx: +2 icon imports, +2 nav links, +2 sections, +~170 lines

Stage Summary:
- tsc --noEmit: 0 errors
- All new text uses i18n t.someKey pattern
- Both new sections use SectionWrapper component (MobileAppSection) or consistent styling (VerseSection)
- No AR translation changes needed (keys already existed)
