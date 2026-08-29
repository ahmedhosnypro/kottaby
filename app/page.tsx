"use client";

import {
  AutoStoriesOutlined as BookIcon,
  WorkspacePremiumOutlined as CertificateIcon,
  CheckCircleOutlined as CheckIcon,
  TimelapseOutlined as ClockIcon,
  Close as CloseIcon,
  ContentCopy as CopyIcon,
  NightsStayOutlined as CrescentIcon,
  DarkModeOutlined,
  ExpandMore,
  FilterListOutlined as FilterIcon,
  PublicOutlined as GlobeIcon,
  GroupsOutlined as GroupsIcon,
  KeyboardArrowLeft,
  KeyboardArrowRight,
  KeyboardArrowUp,
  LightModeOutlined,
  LocationOnOutlined as LocationIcon,
  MailOutlined as MailIcon,
  Menu as MenuIcon,
  MosqueOutlined as MosqueIcon,
  PaymentsOutlined as PaymentsIcon,
  PersonOutlined as PersonIcon,
  PhoneAndroid as PhoneAndroidIcon,
  PhoneIphone as PhoneIphoneIcon,
  MenuBookOutlined as QuranIcon,
  ScheduleOutlined as ScheduleIcon,
  SchoolOutlined as SchoolIcon,
  SecurityOutlined as SecurityIcon,
  Share as ShareIcon,
  Star,
  StarRateOutlined as StarRateIcon,
  TrendingUpOutlined as TrendingIcon,
  EmojiEventsOutlined as TrophyIcon,
} from "@mui/icons-material";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Fab,
  FormControlLabel,
  IconButton,
  TextField as MuiTextField,
  Snackbar,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from "@mui/material";
import { useColorScheme } from "@mui/material/styles";
import Link from "next/link";
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { LocaleSwitcher } from "@/frontend/components/LocaleSwitcher";
import { SiteFooter } from "@/frontend/components/SiteFooter";
import { Landing, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * Landing page — the public front door of Kottaby Academy at `/`.
 *
 * Replaces the prior `redirect("/dashboard")` (which bounced anonymous
 * visitors to `/login` and wasted the most valuable URL). This page is a
 * rich marketing surface: hero, stats bar, features grid, recitations
 * showcase, how-it-works, roles, testimonials, FAQ, newsletter, final CTA,
 * and footer.
 *
 * **Lightweight by design**: no Apollo queries, no auth hooks, no mutation
 * imports — only MUI + i18n. This keeps the turbopack compile footprint
 * small enough to survive the 4 GB / no-swap sandbox.
 *
 * Design (Midnight Blue + Copper brand):
 *  - Hero: midnight-blue gradient with Islamic geometric tessellation +
 *    copper radial glow. Big headline with copper accent word.
 *  - Sections alternate between `background.default` and `background.paper`
 *    for rhythm.
 *  - All accents (badges, icons, underlines, buttons) use copper
 *    (`secondary-main`).
 *
 * Client component — needs `useAppTranslation(Landing)` for bilingual copy.
 * RTL is handled automatically by MUI + the locale-aware Emotion cache.
 */
// ─── Scroll-spy hook ───────────────────────────────────────────────

function useScrollSpy(sectionIds: readonly string[]): string {
  const [activeId, setActiveId] = useState("");
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    for (const id of sectionIds) {
      const el = document.getElementById(id);
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) setActiveId(id);
        },
        { threshold: 0.2, rootMargin: "-80px 0px -50% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => {
      for (const o of observers) o.disconnect();
    };
  }, [sectionIds]);
  return activeId;
}

export default function LandingPage(): ReactNode {
  const t = useAppTranslation(Landing);
  const { mode, setMode } = useColorScheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const prevMode = useRef(mode);
  const [modeFlash, setModeFlash] = useState(false);

  useEffect(() => {
    document.documentElement.style.scrollBehavior = "smooth";
  }, []);

  useEffect(() => {
    // Uniform cleanup kind on every path (oxlint consistent-return): the
    // timer only exists on real mode flips.
    if (prevMode.current === mode) {
      return undefined;
    }
    prevMode.current = mode;
    setModeFlash(true);
    const timer = setTimeout(() => setModeFlash(false), 300);
    return () => clearTimeout(timer);
  }, [mode]);

  const sectionIds = useMemo(
    () =>
      [
        "verse",
        "features",
        "recitations",
        "curriculum",
        "how-it-works",
        "achievements",
        "teachers",
        "roles",
        "pricing",
        "testimonials",
        "faq",
        "newsletter",
        "contact",
        "app",
      ] as const,
    []
  );
  const activeSection = useScrollSpy(sectionIds);

  const navLinks = [
    { label: t.navVerse, href: "#verse" },
    { label: t.navApp, href: "#app" },
    { label: t.navFeatures, href: "#features" },
    { label: t.navRecitations, href: "#recitations" },
    { label: t.navHowItWorks, href: "#how-it-works" },
    { label: t.navRoles, href: "#roles" },
    { label: t.navTestimonials, href: "#testimonials" },
    { label: t.navFaq, href: "#faq" },
    { label: t.navPricing, href: "#pricing" },
    { label: t.navContact, href: "#contact" },
    { label: t.navAchievements, href: "#achievements" },
    { label: t.navTeachers, href: "#teachers" },
    { label: t.navCurriculum, href: "#curriculum" },
    { label: t.navResources, href: "#resources" },
  ];

  // The desktop bar shows the 8 primary sections that measurably fit at
  // 1200-1366px alongside brand + actions. The landing now has 14 anchors
  // (teachers/resources added by the spotlight/resources sections): the
  // 12-link set overlapped the locale switcher by 76px at 1280, and a
  // 10-link set still clipped by 30px. Hidden anchors stay in the mobile
  // drawer and remain reachable by scroll (#verse = page top, #app = bottom,
  // #contact = footer column + newsletter CTA).
  const desktopNavHidden = new Set(["#verse", "#app", "#contact", "#resources", "#roles", "#testimonials"]);
  const desktopNavLinks = navLinks.filter(l => !desktopNavHidden.has(l.href));

  return (
    <Box
      component="div"
      sx={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100vh",
        bgcolor: "var(--mui-palette-background-default)",
      }}
    >
      {/* === Skip-to-content (a11y) === */}
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: "fixed",
          top: 8,
          insetInlineStart: 8,
          zIndex: 2000,
          px: 2,
          py: 1,
          borderRadius: 1.5,
          bgcolor: "var(--mui-palette-secondary-main)",
          color: "var(--mui-palette-onSecondary)",
          fontWeight: 700,
          fontSize: 14,
          textDecoration: "none",
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          transform: "translateY(-200%)",
          transition: "transform 0.2s ease",
          "&:focus-visible": { transform: "translateY(0)" },
        }}
      >
        {t.a11ySkipToContent}
      </Box>

      {/* === Scroll progress bar === */}
      <ScrollProgressBar />

      {/* === Top nav === */}
      <Box
        component="nav"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 100,
          backdropFilter: "blur(12px)",
          bgcolor: "color-mix(in srgb, var(--mui-palette-primary-dark) 70%, transparent)",
          borderBottom: "1px solid var(--mui-palette-divider)",
        }}
      >
        <Container maxWidth="lg">
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", py: 1.5 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
              <BrandMark size={32} />
              <Typography
                sx={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", color: "var(--mui-palette-onPrimary)" }}
              >
                Kottaby Academy
              </Typography>
            </Stack>

            {/* Desktop section nav links */}
            <Stack
              direction="row"
              spacing={0}
              sx={{ alignItems: "center", display: { xs: "none", lg: "flex" }, overflow: "hidden" }}
            >
              {desktopNavLinks.map(link => {
                const isActive = link.href === `#${activeSection}`;
                return (
                  <Button
                    key={link.href}
                    component="a"
                    href={link.href}
                    size="small"
                    sx={{
                      minWidth: "auto",
                      px: 0.25,
                      py: 0.5,
                      fontSize: 12,
                      fontWeight: 600,
                      textTransform: "none",
                      whiteSpace: "nowrap",
                      ...(isActive
                        ? {
                            color: "var(--mui-palette-secondary-light)",
                            position: "relative",
                            "&::after": {
                              content: '""',
                              position: "absolute",
                              bottom: -2,
                              left: "10%",
                              width: "80%",
                              height: 2,
                              bgcolor: "var(--mui-palette-secondary-main)",
                              borderRadius: 1,
                              transition: "all 0.2s ease",
                            },
                          }
                        : {
                            color: "var(--mui-palette-onPrimary)",
                            opacity: 0.7,
                          }),
                      "&:hover": { opacity: 1 },
                      transition: "color 0.2s ease, opacity 0.2s ease",
                    }}
                  >
                    {link.label}
                  </Button>
                );
              })}
            </Stack>

            {/* Desktop actions — hidden on xs/sm */}
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", display: { xs: "none", md: "flex" } }}>
              <LocaleSwitcher />
              {/* Dark mode toggle */}
              <Button
                onClick={() => setMode(mode === "dark" ? "light" : "dark")}
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  p: 1,
                  color: "var(--mui-palette-secondary-light)",
                  borderRadius: 2,
                  "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 15%, transparent)" },
                }}
                aria-label={t.a11yToggleColorMode}
              >
                {mode === "dark" ? <LightModeOutlined /> : <DarkModeOutlined />}
              </Button>
              <Button
                component={Link}
                href="/login"
                variant="text"
                sx={{ color: "var(--mui-palette-onPrimary)", fontWeight: 600, textTransform: "none" }}
              >
                {t.navSignIn}
              </Button>
              <Button
                component={Link}
                href="/register"
                variant="contained"
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  bgcolor: "var(--mui-palette-secondary-main)",
                  color: "var(--mui-palette-onSecondary)",
                  fontWeight: 700,
                  textTransform: "none",
                  borderRadius: 2,
                  px: 2.5,
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: "-100%",
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                    transition: "left 0.5s ease",
                  },
                  "&:hover": {
                    bgcolor: "var(--mui-palette-secondary-dark)",
                    "&::after": { left: "100%" },
                  },
                }}
              >
                {t.navGetStarted}
              </Button>
            </Stack>

            {/* Mobile hamburger button — visible on xs/sm only */}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", display: { xs: "flex", md: "none" } }}>
              <Button
                onClick={() => setMode(mode === "dark" ? "light" : "dark")}
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  p: 1,
                  color: "var(--mui-palette-secondary-light)",
                  borderRadius: 2,
                  "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 15%, transparent)" },
                }}
                aria-label={t.a11yToggleColorMode}
              >
                {mode === "dark" ? <LightModeOutlined /> : <DarkModeOutlined />}
              </Button>
              <Button
                onClick={() => setMobileOpen(prev => !prev)}
                sx={{
                  minWidth: 44,
                  minHeight: 44,
                  p: 1,
                  color: "var(--mui-palette-onPrimary)",
                  borderRadius: 2,
                  "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-onPrimary) 10%, transparent)" },
                }}
                aria-label={t.a11yToggleMenu}
              >
                {mobileOpen ? <CloseIcon /> : <MenuIcon />}
              </Button>
            </Stack>
          </Stack>

          {/* Mobile nav backdrop */}
          <Box
            onClick={() => setMobileOpen(false)}
            sx={theme => ({
              position: "fixed",
              inset: 0,
              bgcolor: `color-mix(in srgb, ${theme.palette.common.black} 50%, transparent)`,
              zIndex: 99,
              opacity: mobileOpen ? 1 : 0,
              pointerEvents: mobileOpen ? "auto" : "none",
              transition: "opacity 0.3s ease",
            })}
          />

          {/* Mobile slide-down menu */}
          <Box
            sx={{
              // 12 nav links + auth CTAs exceed the old 500px cap, silently
              // clipping the trailing Achievements/Curriculum entries.
              maxHeight: mobileOpen ? 720 : 0,
              overflowY: "auto",
              overflowX: "hidden",
              transition: "max-height 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            <Stack
              spacing={1}
              sx={{
                py: 2,
                borderTop: "1px solid var(--mui-palette-divider)",
              }}
            >
              {navLinks.map(link => {
                const isActive = link.href === `#${activeSection}`;
                return (
                  <Button
                    key={link.href}
                    href={link.href}
                    fullWidth
                    onClick={() => setMobileOpen(false)}
                    sx={{
                      color: isActive ? "var(--mui-palette-secondary-light)" : "var(--mui-palette-onPrimary)",
                      justifyContent: "flex-start",
                      fontWeight: 600,
                      textTransform: "none",
                      borderRadius: 1.5,
                      px: 2,
                      py: 1.5,
                      minHeight: 44,
                      borderLeft: isActive ? "3px solid var(--mui-palette-secondary-main)" : "3px solid transparent",
                      "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 12%, transparent)" },
                    }}
                  >
                    {link.label}
                  </Button>
                );
              })}
              <Stack direction="row" spacing={1.5} sx={{ pt: 1.5, px: 1 }}>
                <Button
                  component={Link}
                  href="/login"
                  variant="outlined"
                  fullWidth
                  sx={{
                    color: "var(--mui-palette-onPrimary)",
                    borderColor: "color-mix(in srgb, var(--mui-palette-onPrimary) 30%, transparent)",
                    fontWeight: 600,
                    textTransform: "none",
                    borderRadius: 2,
                    minHeight: 44,
                  }}
                >
                  {t.navSignIn}
                </Button>
                <Button
                  component={Link}
                  href="/register"
                  variant="contained"
                  fullWidth
                  sx={{
                    position: "relative",
                    overflow: "hidden",
                    bgcolor: "var(--mui-palette-secondary-main)",
                    color: "var(--mui-palette-onSecondary)",
                    fontWeight: 700,
                    textTransform: "none",
                    borderRadius: 2,
                    minHeight: 44,
                    "&::after": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: "-100%",
                      width: "100%",
                      height: "100%",
                      background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                      transition: "left 0.5s ease",
                    },
                    "&:hover": {
                      bgcolor: "var(--mui-palette-secondary-dark)",
                      "&::after": { left: "100%" },
                    },
                  }}
                >
                  {t.navGetStarted}
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Container>
      </Box>

      <HeroSection />
      <HijriPrayerStrip />
      <Box component="main" id="main-content">
        <VerseSection />
        <FadeInBox>
          <StatsBar />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox>
          <PartnersSection />
        </FadeInBox>
        <FadeInBox id="features">
          <FeaturesSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="recitations">
          <RecitationsSection />
        </FadeInBox>
        <FadeInBox id="curriculum">
          <CurriculumSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="how-it-works">
          <HowItWorksSection />
        </FadeInBox>
        <FadeInBox id="achievements">
          <AchievementsSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="teachers">
          <TeacherSpotlightSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="roles">
          <RolesSection />
        </FadeInBox>
        <FadeInBox id="pricing">
          <PricingSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="testimonials">
          <TestimonialsSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="resources">
          <ResourcesSection />
        </FadeInBox>
        <FadeInBox id="faq">
          <FaqSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="newsletter">
          <NewsletterSection />
        </FadeInBox>
        <FadeInBox id="contact">
          <ContactSection />
        </FadeInBox>
        <IslamicDivider />
        <FadeInBox id="app">
          <MobileAppSection />
        </FadeInBox>
        <FadeInBox>
          <CtaSection />
        </FadeInBox>
      </Box>
      {/* Mode transition overlay */}
      <Box
        aria-hidden
        sx={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          pointerEvents: "none",
          bgcolor: mode === "dark" ? "var(--mui-palette-primary-dark)" : "var(--mui-palette-background-default)",
          opacity: modeFlash ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
      <SiteFooter />
      {/* Islamic banner above footer — shine gradient accent */}
      <Box
        aria-hidden
        sx={{
          height: 4,
          background:
            "linear-gradient(90deg, var(--mui-palette-secondary-dark), var(--mui-palette-secondary-main), var(--mui-palette-secondary-light), var(--mui-palette-secondary-main), var(--mui-palette-secondary-dark))",
          backgroundSize: "200% 100%",
          animation: "footerBannerShine 6s linear infinite",
          "@keyframes footerBannerShine": {
            "0%": { backgroundPosition: "200% center" },
            "100%": { backgroundPosition: "-200% center" },
          },
        }}
      />
      <BackToTopButton />
      <WhatsAppButton />
      <CookieConsent />
    </Box>
  );
}

// ─── Scroll progress bar ────────────────────────────────────────────

/** This layout makes <body> the scroll container (overflow: hidden auto), so
 * window scrollY stays 0 while the page visually scrolls. Reads take the
 * maximal position across all candidate scrollers; the capture-phase
 * listener catches the non-bubbling scroll event fired at the body. */
function getMaxScrollTop(): number {
  return Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop);
}

const isNumericChar = (ch: string): boolean => (ch >= "0" && ch <= "9") || ch === ",";
const isDigitChar = (ch: string): boolean => ch >= "0" && ch <= "9";

/** RFC-lite email-shape check for client-side hints: single "@", non-empty
 * local and domain parts, at least one dot in the domain, no whitespace and
 * no further "@" characters. Linear scan — avoids the regex-backtracking
 * class (sonarjs/super-linear-regex) entirely. */
function isEmailLike(value: string): boolean {
  const at = value.indexOf("@");
  if (at <= 0 || at === value.length - 1) return false;
  const domain = value.slice(at + 1);
  if (domain.includes("@") || /\s/.test(value)) return false;
  const dot = domain.lastIndexOf(".");
  return dot > 0 && dot < domain.length - 1;
}

function ScrollProgressBar(): ReactNode {
  const [progress, setProgress] = useState(0);

  const handleScroll = useCallback(() => {
    const scrollTop = getMaxScrollTop();
    const scrollHeight =
      document.body.scrollHeight > document.documentElement.scrollHeight
        ? document.body.scrollHeight
        : document.documentElement.scrollHeight;
    const clientHeight = document.documentElement.clientHeight;
    const total = scrollHeight - clientHeight;
    const pct = total > 0 ? (scrollTop / total) * 100 : 0;
    setProgress(pct);
  }, []);

  useEffect(() => {
    // Initial read is deferred to a frame: a synchronous setState in the
    // effect body trips react/set-state-in-effect (cascading render).
    const raf = requestAnimationFrame(handleScroll);
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", handleScroll, { capture: true });
    };
  }, [handleScroll]);

  return (
    <Box
      aria-hidden
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 200,
        bgcolor: "var(--mui-palette-background-default)",
      }}
    >
      <Box
        sx={{
          height: "100%",
          width: `${progress}%`,
          bgcolor: "var(--mui-palette-secondary-main)",
          transition: "width 0.1s linear",
        }}
      />
    </Box>
  );
}

// ─── Scroll-triggered fade-in hook ───────────────────────────────────

function useFadeInOnScroll() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    let observer: IntersectionObserver | undefined;
    if (el) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer?.unobserve(el);
          }
        },
        { threshold: 0.08 }
      );
      observer.observe(el);
    }
    return () => observer?.disconnect();
  }, []);

  return { ref, visible };
}

// ─── FadeInBox wrapper ───────────────────────────────────────────────

function FadeInBox({
  children,
  id,
  delay = 0,
}: {
  readonly children: ReactNode;
  readonly id?: string;
  readonly delay?: number;
}) {
  const { ref, visible } = useFadeInOnScroll();
  return (
    <Box
      ref={ref}
      id={id}
      sx={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(20px)",
        transition: `all 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        // Anchor targets must clear the sticky navbar (65px) plus the 20px
        // fade-in translateY offset that the anchor-scroll geometry can
        // capture mid-transition (otherwise headings land under the bar).
        scrollMarginTop: 96,
      }}
    >
      {children}
    </Box>
  );
}

// ─── Animated counter ────────────────────────────────────────────────

function AnimatedCounter({ raw }: { readonly raw: string }): ReactNode {
  const { num, suffix } = parseStatValue(raw);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = spanRef.current;
    let observer: IntersectionObserver | undefined;
    if (el) {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !started) {
            setStarted(true);
            observer?.unobserve(el);
          }
        },
        { threshold: 0.3 }
      );
      observer.observe(el);
    }
    return () => observer?.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const duration = 2000;
    const startTime = performance.now();

    function easeOutCubic(x: number): number {
      return 1 - (1 - x) ** 3;
    }

    function tick(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setCount(Math.floor(eased * num));
      if (progress < 1) {
        requestAnimationFrame(tick);
      } else {
        setCount(num);
      }
    }

    requestAnimationFrame(tick);
  }, [started, num]);

  return (
    <span ref={spanRef}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/** Parse a stat string like "120+" or "8,500+" into { num, suffix }.
 * Linear scan instead of regex — avoids super-linear backtracking. */
function parseStatValue(raw: string): { num: number; suffix: string } {
  if (raw.length === 0 || !isDigitChar(raw[0])) return { num: 0, suffix: raw };
  let end = 1;
  while (end < raw.length && isNumericChar(raw[end])) {
    end += 1;
  }
  const numPart = raw.slice(0, end);
  const suffixPart = raw.slice(end);
  return { num: parseInt(numPart.replace(/,/g, ""), 10) || 0, suffix: suffixPart };
}

// ─── Back to top button ──────────────────────────────────────────────

function BackToTopButton(): ReactNode {
  const t = useAppTranslation(Landing);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(getMaxScrollTop() > 600);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  const scrollToTop = useCallback(() => {
    document.body.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <Tooltip title={t.a11yBackToTop} placement="top" arrow>
      <span>
        <Fab
          onClick={scrollToTop}
          aria-label={t.a11yBackToTop}
          sx={{
            position: "fixed",
            bottom: 24,
            insetInlineEnd: 24,
            bgcolor: "var(--mui-palette-secondary-main)",
            color: "var(--mui-palette-onSecondary)",
            zIndex: 50,
            opacity: show ? 1 : 0,
            pointerEvents: show ? "auto" : "none",
            transition: "opacity 0.3s ease",
            boxShadow: "0 4px 14px rgba(184,115,51,0.35)",
            "&:hover": { bgcolor: "var(--mui-palette-secondary-dark)" },
          }}
        >
          <KeyboardArrowUp />
        </Fab>
      </span>
    </Tooltip>
  );
}

// ─── Hijri date & prayer times (Cairo) ──────────────────────────────
// Pure client-side solar astronomy — no external API. Standard
// PrayTimes-style formulas: Julian day → sun declination + equation of
// time; Egyptian General Authority angles (Fajr 19.5°, Isha 17.5°);
// Shafi'i Asr (shadow factor 1). Cairo stays on DST, so the UTC offset
// is derived per-instant from Intl. Rendered post-mount only to keep
// SSR and client markup identical (time-dependent content).

const CAIRO_LAT = 30.0444;
const CAIRO_LNG = 31.2357;
const FAJR_ANGLE = 19.5;
const ISHA_ANGLE = 17.5;
const SUNRISE_ALT_DEG = 0.833; // refraction-corrected solar disc

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;
const fixHour = (h: number): number => ((h % 24) + 24) % 24;

/** Sun declination (deg) and equation of time (hours) for a Julian day. */
function sunPosition(jd: number): { declination: number; equationOfTime: number } {
  const d = jd - 2451545.0;
  const g = (((357.529 + 0.98560028 * d) % 360) + 360) % 360;
  const q = (((280.459 + 0.98564736 * d) % 360) + 360) % 360;
  const l = (((q + 1.915 * Math.sin(toRad(g)) + 0.02 * Math.sin(toRad(2 * g))) % 360) + 360) % 360;
  const e = 23.439 - 0.00000036 * d;
  const ra = toDeg(Math.atan2(Math.cos(toRad(e)) * Math.sin(toRad(l)), Math.cos(toRad(l)))) / 15;
  const declination = toDeg(Math.asin(Math.sin(toRad(e)) * Math.sin(toRad(l))));
  const equationOfTime = q / 15 - fixHour(ra);
  return { declination, equationOfTime };
}

/** Hour angle (hours from local noon) for the sun at `angleDeg` below horizon. */
function hourAngleFor(declination: number, angleDeg: number): number {
  const cosH =
    (-Math.sin(toRad(angleDeg)) - Math.sin(toRad(declination)) * Math.sin(toRad(CAIRO_LAT))) /
    (Math.cos(toRad(declination)) * Math.cos(toRad(CAIRO_LAT)));
  return toDeg(Math.acos(Math.min(1, Math.max(-1, cosH)))) / 15;
}

/** DST-aware UTC offset (hours) for Africa/Cairo at the given instant. */
function cairoOffsetHours(date: Date): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      timeZoneName: "longOffset",
    }).formatToParts(date);
    const tz = parts.find(p => p.type === "timeZoneName")?.value ?? "GMT+03:00";
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(tz);
    if (!m) {
      return 3;
    }
    const sign = m[1] === "-" ? -1 : 1;
    return sign * (Number(m[2]) + Number(m[3]) / 60);
  } catch {
    return 3;
  }
}

interface PrayerDaySchedule {
  fajr: number;
  sunrise: number;
  dhuhr: number;
  asr: number;
  maghrib: number;
  isha: number;
}

/** Cairo prayer times as local clock hours (0-24) for the date's solar day. */
function cairoPrayerSchedule(date: Date): PrayerDaySchedule {
  const offset = cairoOffsetHours(date);
  const jd = date.getTime() / 86400000 + 2440587.5 - CAIRO_LNG / (15 * 24);
  const { declination, equationOfTime } = sunPosition(jd);
  const dhuhr = 12 + offset - CAIRO_LNG / 15 - equationOfTime;
  const asrAltitude = toDeg(Math.atan(1 / (1 + Math.tan(toRad(Math.abs(CAIRO_LAT - declination))))));
  return {
    fajr: dhuhr - hourAngleFor(declination, FAJR_ANGLE),
    sunrise: dhuhr - hourAngleFor(declination, SUNRISE_ALT_DEG),
    dhuhr,
    asr: dhuhr + hourAngleFor(declination, -asrAltitude),
    maghrib: dhuhr + hourAngleFor(declination, SUNRISE_ALT_DEG),
    isha: dhuhr + hourAngleFor(declination, ISHA_ANGLE),
  };
}

/** Next prayer (skipping sunrise) as [key, hours-from-now-including-rollover]. */
function nextPrayer(schedule: PrayerDaySchedule, nowHours: number): { key: string; inHours: number } {
  const order: { key: string; at: number }[] = [
    { key: "fajr", at: schedule.fajr },
    { key: "dhuhr", at: schedule.dhuhr },
    { key: "asr", at: schedule.asr },
    { key: "maghrib", at: schedule.maghrib },
    { key: "isha", at: schedule.isha },
  ];
  for (const p of order) {
    if (p.at > nowHours) {
      return { key: p.key, inHours: p.at - nowHours };
    }
  }
  return { key: "fajr", inHours: schedule.fajr + 24 - nowHours };
}

/** UTC-midnight epoch ms for the date part of `d` (module scope: the React
    compiler misreads the uppercase `Date.UTC` member as a component). */
function utcMidnightOf(d: Date): number {
  const t = new Date(d);
  t.setUTCHours(0, 0, 0, 0);
  return t.getTime();
}

function HijriPrayerStrip(): ReactNode {
  const t = useAppTranslation(Landing);
  const locale = useAppLocale();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    // rAF-deferred initial read (set-state-in-effect: sync setState inside
    // effects triggers cascading renders — same pattern as ScrollProgressBar).
    let id: ReturnType<typeof setInterval> | undefined;
    const raf = requestAnimationFrame(() => {
      setNow(new Date());
      id = setInterval(() => setNow(new Date()), 30000);
    });
    return () => {
      cancelAnimationFrame(raf);
      if (id !== undefined) {
        clearInterval(id);
      }
    };
  }, []);

  const model = useMemo(() => {
    if (!now) {
      return null;
    }
    const offset = cairoOffsetHours(now);
    const schedule = cairoPrayerSchedule(now);
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
    const nowHours = fixHour(utcHours + offset);
    const next = nextPrayer(schedule, nowHours);
    const utcMidnight = utcMidnightOf(now);
    const timeFmt = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "Africa/Cairo",
    });
    const fmt = (hours: number): string => timeFmt.format(new Date(utcMidnight + (hours - offset) * 3600000));
    const hijriFmt = new Intl.DateTimeFormat(
      locale === "ar" ? "ar-EG-u-ca-islamic-umalqura" : "en-u-ca-islamic-umalqura",
      { day: "numeric", month: "long", year: "numeric" }
    );
    const totalMin = Math.max(0, Math.round(next.inHours * 60));
    const cdH = Math.floor(totalMin / 60);
    const cdM = totalMin % 60;
    return {
      hijri: hijriFmt.format(now),
      times: [
        { key: "fajr", label: t.prayerFajr, value: fmt(schedule.fajr) },
        { key: "sunrise", label: t.prayerSunrise, value: fmt(schedule.sunrise) },
        { key: "dhuhr", label: t.prayerDhuhr, value: fmt(schedule.dhuhr) },
        { key: "asr", label: t.prayerAsr, value: fmt(schedule.asr) },
        { key: "maghrib", label: t.prayerMaghrib, value: fmt(schedule.maghrib) },
        { key: "isha", label: t.prayerIsha, value: fmt(schedule.isha) },
      ],
      nextKey: next.key,
      countdown: cdH > 0 ? `${cdH}:${String(cdM).padStart(2, "0")}` : `${cdM}:00`,
    };
  }, [now, locale, t]);

  return (
    <Box
      component="section"
      aria-label={t.hijriStripAriaLabel}
      sx={{
        borderBottom: "1px solid var(--mui-palette-divider)",
        bgcolor: "color-mix(in srgb, var(--mui-palette-primary-main) 14%, transparent)",
        minHeight: { xs: 56, md: 52 },
        display: "flex",
        alignItems: "center",
      }}
    >
      <Container maxWidth="lg">
        {model === null ? (
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "center", py: 1, opacity: 0.4 }}>
            <CircularProgress size={16} thickness={5} aria-hidden />
          </Stack>
        ) : (
          <Stack
            direction={{ xs: "column", md: "row" }}
            spacing={{ xs: 0.75, md: 2 }}
            sx={{ alignItems: { md: "center" }, justifyContent: { md: "space-between" }, py: 0.75 }}
          >
            {/* Hijri date chip */}
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
              <Box
                aria-hidden
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 26,
                  height: 26,
                  borderRadius: "50%",
                  bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 18%, transparent)",
                  color: "var(--mui-palette-secondary-light)",
                }}
              >
                <CrescentIcon sx={{ fontSize: 15 }} />
              </Box>
              <Typography sx={{ fontSize: 12, opacity: 0.65, fontWeight: 600 }}>{t.hijriToday}</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 700, color: "var(--mui-palette-onPrimary)" }}>
                {model.hijri}
              </Typography>
            </Stack>

            {/* Prayer times row */}
            <Stack
              direction="row"
              spacing={0.75}
              sx={{ alignItems: "center", justifyContent: "center", flexWrap: "wrap", rowGap: 0.5 }}
            >
              {model.times.map(p => {
                const isNext = p.key === model.nextKey;
                return (
                  <Stack
                    key={p.key}
                    direction="row"
                    spacing={0.75}
                    sx={{
                      alignItems: "center",
                      px: 1.25,
                      py: 0.4,
                      borderRadius: 99,
                      ...(isNext
                        ? {
                            bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 22%, transparent)",
                            border: "1px solid var(--mui-palette-secondary-main)",
                          }
                        : {}),
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: 11.5,
                        fontWeight: isNext ? 800 : 600,
                        color: isNext ? "var(--mui-palette-secondary-light)" : undefined,
                        opacity: isNext ? 1 : 0.6,
                      }}
                    >
                      {p.label}
                    </Typography>
                    <Typography sx={{ fontSize: 12, fontWeight: 700, opacity: isNext ? 1 : 0.85 }}>
                      {p.value}
                    </Typography>
                    {isNext && (
                      <Typography
                        sx={{
                          fontSize: 11,
                          fontWeight: 700,
                          color: "var(--mui-palette-secondary-light)",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 0.25,
                        }}
                      >
                        · {t.prayerIn} {model.countdown}
                      </Typography>
                    )}
                  </Stack>
                );
              })}
            </Stack>
          </Stack>
        )}
      </Container>
    </Box>
  );
}

// ─── Islamic decorative divider ───────────────────────────────────

function IslamicDivider(): ReactNode {
  return (
    <Box
      aria-hidden
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: 1,
        px: 4,
      }}
    >
      <Box
        sx={{
          flex: 1,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--mui-palette-secondary-main) 45%, transparent) 30%, color-mix(in srgb, var(--mui-palette-secondary-main) 45%, transparent) 70%, transparent)",
        }}
      />
      {/* Center diamond ornament */}
      <Box
        sx={{
          width: 12,
          height: 12,
          transform: "rotate(45deg)",
          bgcolor: "var(--mui-palette-secondary-main)",
          opacity: 0.85,
          mx: 2,
          flexShrink: 0,
          animation: "dividerSpin 12s linear infinite",
          boxShadow: "0 0 10px rgba(184,115,51,0.55)",
          "@keyframes dividerSpin": {
            "0%": { transform: "rotate(45deg)" },
            "100%": { transform: "rotate(405deg)" },
          },
        }}
      />
      <Box
        sx={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          bgcolor: "var(--mui-palette-secondary-main)",
          opacity: 0.45,
          mx: 1,
          flexShrink: 0,
        }}
      />
      <Box
        sx={{
          width: 4,
          height: 4,
          borderRadius: "50%",
          bgcolor: "var(--mui-palette-secondary-main)",
          opacity: 0.45,
          mx: 1,
          flexShrink: 0,
        }}
      />
      <Box
        sx={{
          width: 12,
          height: 12,
          transform: "rotate(45deg)",
          bgcolor: "var(--mui-palette-secondary-main)",
          opacity: 0.85,
          mx: 2,
          flexShrink: 0,
          animation: "dividerSpin 12s linear infinite",
          boxShadow: "0 0 10px rgba(184,115,51,0.55)",
          "@keyframes dividerSpin": {
            "0%": { transform: "rotate(45deg)" },
            "100%": { transform: "rotate(405deg)" },
          },
        }}
      />
      <Box
        sx={{
          flex: 1,
          height: 1,
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--mui-palette-secondary-main) 45%, transparent) 30%, color-mix(in srgb, var(--mui-palette-secondary-main) 45%, transparent) 70%, transparent)",
        }}
      />
    </Box>
  );
}

// ─── Hero particles ──────────────────────────────────────────────

function HeroParticles(): ReactNode {
  const particles = useMemo(
    () =>
      Array.from({ length: 25 }, (_, i) => ({
        id: i,
        left: `${(i * 37 + 13) % 100}%`,
        top: `${(i * 53 + 7) % 100}%`,
        // 2px base — a size of 1 would serialize as "100%" in MUI sx
        // (number 1 is treated as a fraction), which rendered full-hero
        // copper circles. Explicit px strings keep the intent unambiguous.
        size: 2 + (i % 3),
        delay: `${(i * 0.7) % 4}s`,
        duration: `${2 + (i % 3)}s`,
      })),
    []
  );

  return (
    <Box
      aria-hidden
      sx={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        zIndex: 0,
      }}
    >
      {particles.map(p => (
        <Box
          key={p.id}
          sx={{
            position: "absolute",
            left: p.left,
            top: p.top,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: "50%",
            bgcolor: "var(--mui-palette-secondary-light)",
            animation: `twinkle ${p.duration} ease-in-out ${p.delay} infinite`,
            "@keyframes twinkle": {
              "0%": { opacity: 0 },
              "50%": { opacity: 0.8 },
              "100%": { opacity: 0 },
            },
          }}
        />
      ))}
    </Box>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────

function HeroSection(): ReactNode {
  const t = useAppTranslation(Landing);

  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        overflow: "hidden",
        // In a constrained column-flex ancestor, overflow:hidden makes the
        // flex min-height resolve to 0 and this section can shrink-collapse
        // (observed as a 0px hero under a stale dev graph). Pin it open.
        flexShrink: 0,
        background:
          "linear-gradient(160deg, var(--mui-palette-primary-dark) 0%, var(--mui-palette-primary-main) 50%, var(--mui-palette-primary-dark) 100%)",
        color: "var(--mui-palette-onPrimary)",
      }}
    >
      <HeroParticles />
      {/* Islamic geometric tessellation overlay */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.06,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 32px, var(--mui-palette-secondary-light) 32px, var(--mui-palette-secondary-light) 34px), repeating-linear-gradient(-45deg, transparent, transparent 32px, var(--mui-palette-secondary-light) 32px, var(--mui-palette-secondary-light) 34px)",
        }}
      />
      {/* Copper radial glow top-right */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "-15%",
          insetInlineEnd: "-10%",
          width: "55%",
          height: "70%",
          background: "radial-gradient(circle, var(--mui-palette-secondary-main) 0%, transparent 65%)",
          opacity: 0.18,
          pointerEvents: "none",
        }}
      />

      {/* Floating decorative circles */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "12%",
          insetInlineEnd: "8%",
          width: 180,
          height: 180,
          borderRadius: "50%",
          border: "2px solid var(--mui-palette-secondary-main)",
          opacity: 0.12,
          pointerEvents: "none",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "18%",
          insetInlineStart: "5%",
          width: 100,
          height: 100,
          borderRadius: "50%",
          bgcolor: "var(--mui-palette-secondary-main)",
          opacity: 0.07,
          pointerEvents: "none",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "55%",
          insetInlineEnd: "22%",
          width: 60,
          height: 60,
          borderRadius: "50%",
          border: "1.5px solid var(--mui-palette-secondary-light)",
          opacity: 0.1,
          pointerEvents: "none",
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "10%",
          insetInlineEnd: "40%",
          width: 40,
          height: 40,
          borderRadius: "50%",
          bgcolor: "var(--mui-palette-secondary-light)",
          opacity: 0.08,
          pointerEvents: "none",
        }}
      />

      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1, py: { xs: 8, md: 12 } }}>
        <Stack spacing={4} sx={{ alignItems: "flex-start", maxWidth: 760 }}>
          {/* Live indicator badge */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              px: 2,
              py: 0.75,
              borderRadius: 99,
              border: "1px solid var(--mui-palette-secondary-main)",
              bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 12%, transparent)",
            }}
          >
            <Box
              aria-hidden
              sx={theme => ({
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: theme.palette.success.main,
                position: "relative",
                "&::after": {
                  content: '""',
                  position: "absolute",
                  inset: -3,
                  borderRadius: "50%",
                  border: "2px solid",
                  borderColor: theme.palette.success.main,
                  animation: "livePulse 1.5s ease-in-out infinite",
                },
                "@keyframes livePulse": {
                  "0%": { opacity: 0.6, transform: "scale(0.8)" },
                  "50%": { opacity: 0, transform: "scale(1.4)" },
                  "100%": { opacity: 0, transform: "scale(1.4)" },
                },
              })}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: "0.04em", textTransform: "none" }}>
              {t.heroLiveLabel}
            </Typography>
          </Stack>

          {/* Badge */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              px: 2,
              py: 0.75,
              borderRadius: 99,
              border: "1px solid var(--mui-palette-secondary-main)",
              bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 12%, transparent)",
            }}
          >
            <Box
              aria-hidden
              sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "var(--mui-palette-secondary-light)" }}
            />
            <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: "0.04em", textTransform: "none" }}>
              {t.heroBadge}
            </Typography>
          </Stack>

          {/* Headline with gradient accent word */}
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: 36, md: 56 },
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              m: 0,
            }}
          >
            {t.heroTitle}{" "}
            <Box
              component="span"
              sx={{
                background:
                  "linear-gradient(135deg, var(--mui-palette-secondary-light) 0%, var(--mui-palette-secondary-main) 100%)",
                backgroundClip: "text",
                WebkitBackgroundClip: "text",
                color: "transparent",
              }}
            >
              {t.heroTitleAccent}
            </Box>
          </Typography>

          {/* Subtitle */}
          <Typography
            variant="h6"
            component="p"
            sx={{ maxWidth: 580, lineHeight: 1.6, opacity: 0.85, fontWeight: 400, fontSize: { xs: 16, md: 18 } }}
          >
            {t.heroSubtitle}
          </Typography>

          {/* CTAs */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ pt: 1 }}>
            <Button
              component={Link}
              href="/register"
              variant="contained"
              size="large"
              sx={{
                position: "relative",
                overflow: "hidden",
                bgcolor: "var(--mui-palette-secondary-main)",
                color: "var(--mui-palette-onSecondary)",
                fontWeight: 700,
                textTransform: "none",
                fontSize: 16,
                borderRadius: 2,
                px: 4,
                py: 1.5,
                boxShadow: "0 8px 24px rgba(184,115,51,0.35)",
                "&:hover": {
                  bgcolor: "var(--mui-palette-secondary-dark)",
                  transform: "translateY(-2px)",
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: "-100%",
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
                    transition: "left 0.5s ease",
                  },
                },
                "&:hover::after": {
                  left: "100%",
                },
                transition: "all 0.2s ease",
              }}
            >
              {t.heroCtaPrimary}
            </Button>
            <Button
              component={Link}
              href="/login"
              variant="outlined"
              size="large"
              sx={{
                color: "var(--mui-palette-onPrimary)",
                borderColor: "color-mix(in srgb, var(--mui-palette-onPrimary) 30%, transparent)",
                fontWeight: 700,
                textTransform: "none",
                fontSize: 16,
                borderRadius: 2,
                px: 4,
                py: 1.5,
                "&:hover": {
                  borderColor: "var(--mui-palette-secondary-light)",
                  bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 8%, transparent)",
                },
                transition: "all 0.2s ease",
              }}
            >
              {t.heroCtaSecondary}
            </Button>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

// ─── Verse of the Day ───────────────────────────────────────────

function VerseSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(`${t.verseArabic}\n${t.verseTranslation}\n${t.verseReference}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: no-op if clipboard API fails
    }
  }, [t.verseArabic, t.verseTranslation, t.verseReference]);

  const handleShare = useCallback(async () => {
    const shareText = `${t.verseArabic}\n${t.verseTranslation}\n${t.verseReference}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t.verseBadge, text: shareText });
      } catch {
        // User cancelled or share failed
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback: no-op
      }
    }
  }, [t.verseArabic, t.verseTranslation, t.verseReference, t.verseBadge]);

  return (
    <Box
      id="verse"
      component="section"
      sx={{
        position: "relative",
        overflow: "hidden",
        // Anchor jump must clear the sticky navbar + fade-in offset race.
        scrollMarginTop: 96,
        background:
          "linear-gradient(200deg, var(--mui-palette-primary-dark) 0%, var(--mui-palette-primary-main) 60%, var(--mui-palette-primary-dark) 100%)",
        color: "var(--mui-palette-onPrimary)",
        py: { xs: 8, md: 12 },
      }}
    >
      {/* Islamic geometric pattern overlay */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 32px, var(--mui-palette-secondary-light) 32px, var(--mui-palette-secondary-light) 34px), repeating-linear-gradient(-45deg, transparent, transparent 32px, var(--mui-palette-secondary-light) 32px, var(--mui-palette-secondary-light) 34px)",
        }}
      />
      {/* Decorative copper radial glow on the left */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "-10%",
          insetInlineStart: "-15%",
          width: "50%",
          height: "80%",
          background: "radial-gradient(circle, var(--mui-palette-secondary-main) 0%, transparent 60%)",
          opacity: 0.15,
          pointerEvents: "none",
        }}
      />

      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
        <Stack spacing={4} sx={{ alignItems: "center", textAlign: "center" }}>
          {/* Badge */}
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box aria-hidden sx={{ width: 24, height: 2, bgcolor: "var(--mui-palette-secondary-main)" }} />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--mui-palette-secondary-main)",
                lineHeight: 1,
              }}
            >
              {t.verseBadge}
            </Typography>
            <Box aria-hidden sx={{ width: 24, height: 2, bgcolor: "var(--mui-palette-secondary-main)" }} />
          </Stack>

          {/* Title */}
          <Typography
            component="h3"
            sx={{
              fontWeight: 800,
              fontSize: { xs: 26, md: 34 },
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              m: 0,
              color: "var(--mui-palette-onPrimary)",
            }}
          >
            {t.verseTitle}
          </Typography>

          {/* Decorative horizontal line */}
          <Box
            aria-hidden
            sx={{
              width: 60,
              height: 2,
              bgcolor: "var(--mui-palette-secondary-main)",
              borderRadius: 1,
            }}
          />

          {/* Arabic verse text */}
          <Typography
            sx={{
              fontFamily: '"Cairo", sans-serif',
              fontSize: { xs: 32, md: 48 },
              fontWeight: 700,
              direction: "rtl",
              lineHeight: 1.8,
              color: "var(--mui-palette-secondary-light)",
              maxWidth: 700,
            }}
          >
            {t.verseArabic}
          </Typography>

          {/* Surah chip */}
          <Chip
            label={t.verseSurah}
            variant="outlined"
            size="small"
            sx={{
              borderColor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-secondary-light)",
              fontWeight: 600,
              fontSize: 13,
            }}
          />

          {/* Translation */}
          <Typography
            variant="body1"
            sx={{
              fontStyle: "italic",
              maxWidth: 560,
              lineHeight: 1.7,
              opacity: 0.85,
              fontSize: { xs: 16, md: 18 },
            }}
          >
            {t.verseTranslation}
          </Typography>

          {/* Reference */}
          <Typography
            variant="caption"
            sx={{
              opacity: 0.6,
              letterSpacing: "0.02em",
            }}
          >
            {t.verseReference}
          </Typography>

          {/* Subtitle */}
          <Typography
            variant="body2"
            sx={{
              maxWidth: 480,
              lineHeight: 1.6,
              opacity: 0.75,
              mt: -0.5,
            }}
          >
            {t.verseSubtitle}
          </Typography>

          {/* Copy / Share buttons */}
          <Stack direction="row" spacing={1} sx={{ mt: -1, alignItems: "center" }}>
            <IconButton
              onClick={handleCopy}
              size="small"
              aria-label={t.verseCopy}
              sx={{
                minHeight: 44,
                minWidth: 44,
                color: "var(--mui-palette-secondary-light)",
                "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-light) 15%, transparent)" },
              }}
            >
              <CopyIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Typography
              variant="caption"
              sx={{
                color: "var(--mui-palette-secondary-light)",
                opacity: copied ? 1 : 0.7,
                lineHeight: 2.5,
                fontWeight: copied ? 600 : 400,
              }}
            >
              {copied ? t.verseCopied : t.verseCopy}
            </Typography>
            <Box sx={{ width: 8 }} />
            <IconButton
              onClick={handleShare}
              size="small"
              aria-label={t.verseShare}
              sx={{
                minHeight: 44,
                minWidth: 44,
                color: "var(--mui-palette-secondary-light)",
                "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-light) 15%, transparent)" },
              }}
            >
              <ShareIcon sx={{ fontSize: 18 }} />
            </IconButton>
            <Typography
              variant="caption"
              sx={{ color: "var(--mui-palette-secondary-light)", opacity: 0.7, lineHeight: 2.5 }}
            >
              {t.verseShare}
            </Typography>
          </Stack>
        </Stack>
      </Container>
    </Box>
  );
}

// ─── Stats bar ───────────────────────────────────────────────────────

function StatsBar(): ReactNode {
  const t = useAppTranslation(Landing);
  const statsRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = statsRef.current;
    let obs: IntersectionObserver | undefined;
    if (el) {
      obs = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setInView(true);
            obs?.unobserve(el);
          }
        },
        { threshold: 0.3 }
      );
      obs.observe(el);
    }
    return () => obs?.disconnect();
  }, []);

  const statIcons: ReactNode[] = [
    <SchoolIcon key="t" />,
    <GroupsIcon key="s" />,
    <BookIcon key="b" />,
    <GlobeIcon key="g" />,
  ];

  const stats = [
    { value: t.statsTeachers, label: t.statsTeachersLabel },
    { value: t.statsStudents, label: t.statsStudentsLabel },
    { value: t.statsRecitations, label: t.statsRecitationsLabel },
    { value: t.statsCountries, label: t.statsCountriesLabel },
  ];

  return (
    <Box
      component="section"
      ref={statsRef}
      sx={{
        position: "relative",
        bgcolor: "var(--mui-palette-primary-dark)",
        color: "var(--mui-palette-onPrimary)",
        borderBottom: "1px solid var(--mui-palette-divider)",
      }}
    >
      {/* Subtle geometric pattern overlay (lighter than hero) */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.03,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 32px, var(--mui-palette-secondary-light) 32px, var(--mui-palette-secondary-light) 34px), repeating-linear-gradient(-45deg, transparent, transparent 32px, var(--mui-palette-secondary-light) 32px, var(--mui-palette-secondary-light) 34px)",
        }}
      />
      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={{ xs: 2, sm: 0 }}
          sx={{ py: 3, justifyContent: "space-around", alignItems: "center" }}
        >
          {stats.map((s, idx) => (
            <Stack key={s.label} spacing={0.5} sx={{ alignItems: "center", textAlign: "center", flex: 1 }}>
              <Box
                sx={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 15%, transparent)",
                  color: "var(--mui-palette-secondary-main)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 0.5,
                  opacity: inView ? 1 : 0,
                  animation: inView ? "statIconPulse 0.6s ease-out" : "none",
                  "@keyframes statIconPulse": {
                    "0%": { transform: "scale(0.5)", opacity: 0 },
                    "60%": { transform: "scale(1.15)", opacity: 1 },
                    "100%": { transform: "scale(1)", opacity: 1 },
                  },
                  "& svg": { fontSize: 18 },
                }}
              >
                {statIcons[idx]}
              </Box>
              <Typography
                sx={{
                  fontSize: { xs: 28, md: 36 },
                  fontWeight: 800,
                  color: "var(--mui-palette-secondary-light)",
                  lineHeight: 1,
                  textShadow: "0 0 24px rgba(184,115,51,0.3)",
                }}
              >
                <AnimatedCounter raw={s.value} />
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.7, textTransform: "none", letterSpacing: "0.02em" }}>
                {s.label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Container>
    </Box>
  );
}

// ─── Partners / Trusted By section ───────────────────────────────────

function PartnersSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const partners = [t.partner1Name, t.partner2Name, t.partner3Name, t.partner4Name, t.partner5Name, t.partner6Name];
  const cardSx = {
    minWidth: 160,
    p: 2.5,
    borderRadius: 2,
    border: "1px solid var(--mui-palette-divider)",
    bgcolor: "var(--mui-palette-background-default)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    flexShrink: 0,
    transition: "border-color 0.2s ease",
    "&:hover": { borderColor: "var(--mui-palette-secondary-main)" },
  };

  return (
    <SectionWrapper badge={t.partnersBadge} title={t.partnersTitle} subtitle={t.partnersSubtitle} bg="paper">
      <Box sx={{ position: "relative", overflow: "hidden" }}>
        {/* Left fade gradient */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 60,
            zIndex: 2,
            background: "linear-gradient(90deg, var(--mui-palette-background-paper), transparent)",
            pointerEvents: "none",
          }}
        />
        {/* Right fade gradient */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: 60,
            zIndex: 2,
            background: "linear-gradient(270deg, var(--mui-palette-background-paper), transparent)",
            pointerEvents: "none",
          }}
        />
        <Box
          sx={{
            display: "flex",
            gap: 2.5,
            width: "fit-content",
            animation: "partnersMarquee 35s linear infinite",
            "&:hover": { animationPlayState: "paused" },
            "@keyframes partnersMarquee": {
              "0%": { transform: "translateX(0)" },
              "100%": { transform: "translateX(calc(-50% - 10px))" },
            },
          }}
        >
          {partners.map(name => (
            <Box key={name} sx={cardSx}>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: 13, md: 15 },
                  color: "var(--mui-palette-text-primary)",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </Typography>
            </Box>
          ))}
          {partners.map(name => (
            <Box key={`${name}-dup`} sx={cardSx}>
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: 13, md: 15 },
                  color: "var(--mui-palette-text-primary)",
                  lineHeight: 1.3,
                  whiteSpace: "nowrap",
                }}
              >
                {name}
              </Typography>
            </Box>
          ))}
        </Box>
      </Box>
    </SectionWrapper>
  );
}

// ─── Features ────────────────────────────────────────────────────────

function FeaturesSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const features = [
    { icon: <CheckIcon />, title: t.featureVerifiedTitle, body: t.featureVerifiedBody },
    { icon: <BookIcon />, title: t.featureRecitationsTitle, body: t.featureRecitationsBody },
    { icon: <TrendingIcon />, title: t.featureProgressTitle, body: t.featureProgressBody },
    { icon: <SecurityIcon />, title: t.featureSecureTitle, body: t.featureSecureBody },
    { icon: <ScheduleIcon />, title: t.featureSchedulingTitle, body: t.featureSchedulingBody },
    { icon: <PaymentsIcon />, title: t.featurePaymentsTitle, body: t.featurePaymentsBody },
  ];

  return (
    <SectionWrapper badge={t.featuresBadge} title={t.featuresTitle} subtitle={t.featuresSubtitle} bg="default">
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, var(--mui-palette-secondary-main) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          opacity: 0.04,
          pointerEvents: "none",
        }}
      />
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr" },
          gap: 3,
        }}
      >
        {features.map(f => (
          <FeatureCard key={f.title} icon={f.icon} title={f.title} body={f.body} />
        ))}
      </Box>
    </SectionWrapper>
  );
}

function FeatureCard({ icon, title, body }: Readonly<{ icon: ReactNode; title: string; body: string }>): ReactNode {
  return (
    <Stack
      spacing={1.5}
      sx={{
        p: 3,
        borderRadius: 3,
        bgcolor: "var(--mui-palette-background-paper)",
        border: "1px solid var(--mui-palette-divider)",
        transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
        "&:hover": {
          borderColor: "var(--mui-palette-secondary-main)",
          boxShadow:
            "0 8px 24px rgba(184,115,51,0.12), inset 0 1px 0 rgba(184,115,51,0.06), 0 0 20px rgba(184,115,51,0.08)",
          transform: "translateY(-2px)",
          backdropFilter: "blur(8px)",
          bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 80%, transparent)",
        },
        height: "100%",
        position: "relative",
        overflow: "hidden",
        "&::after": {
          content: '""',
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "40%",
          background:
            "linear-gradient(to top, color-mix(in srgb, var(--mui-palette-secondary-main) 0.06), transparent)",
          opacity: 0,
          transition: "opacity 0.3s ease",
          pointerEvents: "none",
        },
        "&:hover::after": {
          opacity: 1,
        },
      }}
    >
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 10%, transparent)",
          color: "var(--mui-palette-secondary-main)",
          "& svg": { fontSize: 24 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 17, lineHeight: 1.3 }}>
        {title}
      </Typography>
      <Typography variant="body2" sx={{ color: "var(--mui-palette-text-secondary)", lineHeight: 1.6, fontSize: 14 }}>
        {body}
      </Typography>
    </Stack>
  );
}

// ─── Recitations showcase ────────────────────────────────────────────

function RecitationsSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const [search, setSearch] = useState("");

  const recitations = useMemo(
    () => [
      { name: "Hafs ʿan ʿĀṣim", arabic: "حفص عن عاصم", popular: true },
      { name: "Shuʿba ʿan ʿĀṣim", arabic: "شعبة عن عاصم" },
      { name: "Qālūn ʿan Nāfiʿ", arabic: "قالون عن نافع" },
      { name: "Warsh ʿan Nāfiʿ", arabic: "ورش عن نافع" },
      { name: "al-Dūrī ʿan Abī ʿAmr", arabic: "الدوري عن أبي عمرو" },
      { name: "al-Sūsī ʿan Abī ʿAmr", arabic: "السوسي عن أبي عمرو" },
      { name: "Hishām ʿan Ibn ʿĀmir", arabic: "هشام عن ابن عامر" },
      { name: "Ibn Dhakwān ʿan Ibn ʿĀmir", arabic: "ابن ذكوان عن ابن عامر" },
      { name: "Khalaf ʿan Ḥamzah", arabic: "خلف عن حمزة" },
      { name: "al-Dūrī ʿan al-Kisāʾī", arabic: "الدوري عن الكسائي" },
    ],
    []
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return recitations;
    return recitations.filter(r => r.name.toLowerCase().includes(q) || r.arabic.includes(q));
  }, [search, recitations]);

  return (
    <SectionWrapper badge={t.recitationsBadge} title={t.recitationsTitle} subtitle={t.recitationsSubtitle} bg="paper">
      {/* Search field */}
      <MuiTextField
        fullWidth
        placeholder={t.recitationSearchPlaceholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
        variant="outlined"
        size="small"
        sx={{
          maxWidth: 400,
          mb: 3,
          bgcolor: "var(--mui-palette-background-default)",
          borderRadius: 2,
          "& .MuiOutlinedInput-root": {
            borderRadius: 2,
            "& fieldset": {
              borderColor: "var(--mui-palette-divider)",
            },
            "&:hover fieldset": {
              borderColor: "var(--mui-palette-secondary-main)",
            },
          },
        }}
        slotProps={{
          input: {
            startAdornment: <FilterIcon sx={{ mr: 1, color: "var(--mui-palette-text-secondary)", fontSize: 20 }} />,
          },
        }}
      />

      {filtered.length === 0 ? (
        <Box sx={{ textAlign: "center", py: 6 }}>
          <Typography variant="body1" sx={{ color: "var(--mui-palette-text-secondary)" }}>
            {t.recitationNoResults}
          </Typography>
        </Box>
      ) : (
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr", lg: "1fr 1fr 1fr 1fr 1fr" },
            gap: 2,
          }}
        >
          {filtered.map(r => (
            <Stack
              key={r.name}
              spacing={0.75}
              sx={{
                p: 2,
                borderRadius: 2,
                bgcolor: "var(--mui-palette-background-default)",
                border: "1px solid var(--mui-palette-divider)",
                position: "relative",
                transition: "border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease",
                "&:hover": {
                  borderColor: "var(--mui-palette-secondary-main)",
                  transform: "translateY(-4px)",
                  boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
                },
              }}
            >
              {r.popular ? (
                <Box
                  sx={{
                    position: "absolute",
                    top: -8,
                    insetInlineEnd: 8,
                    px: 1,
                    py: 0.25,
                    borderRadius: 99,
                    bgcolor: "var(--mui-palette-secondary-main)",
                    color: "var(--mui-palette-onSecondary)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                  }}
                >
                  Popular
                </Box>
              ) : null}
              <Typography
                sx={{ fontSize: 13, fontWeight: 700, color: "var(--mui-palette-text-primary)", lineHeight: 1.3 }}
              >
                {r.name}
              </Typography>
              <Typography
                sx={{
                  fontSize: 14,
                  color: "var(--mui-palette-secondary-main)",
                  fontFamily: '"Cairo", sans-serif',
                  direction: "rtl",
                }}
              >
                {r.arabic}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
    </SectionWrapper>
  );
}

// ─── Curriculum Roadmap ─────────────────────────────────────────────

function CurriculumSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const steps = [
    { num: "01", title: t.curriculumStep1, desc: t.curriculumStep1Desc },
    { num: "02", title: t.curriculumStep2, desc: t.curriculumStep2Desc },
    { num: "03", title: t.curriculumStep3, desc: t.curriculumStep3Desc },
    { num: "04", title: t.curriculumStep4, desc: t.curriculumStep4Desc },
    { num: "05", title: t.curriculumStep5, desc: t.curriculumStep5Desc },
  ];

  return (
    <SectionWrapper badge={t.curriculumBadge} title={t.curriculumTitle} subtitle={t.curriculumSubtitle} bg="default">
      <Box sx={{ position: "relative", maxWidth: 720, mx: "auto" }}>
        {/* Vertical timeline line */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: 0,
            bottom: 0,
            insetInlineStart: 23,
            width: 2,
            bgcolor: "var(--mui-palette-secondary-main)",
            opacity: 0.25,
          }}
        />

        <Stack spacing={4}>
          {steps.map(step => (
            <Stack
              key={step.num}
              direction="row"
              spacing={3}
              sx={{
                alignItems: "flex-start",
                position: "relative",
              }}
            >
              {/* Numbered circle */}
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "var(--mui-palette-secondary-main)",
                  color: "var(--mui-palette-onSecondary)",
                  fontSize: 16,
                  fontWeight: 800,
                  flexShrink: 0,
                  boxShadow: "0 4px 12px rgba(184,115,51,0.25)",
                  zIndex: 1,
                }}
              >
                {step.num}
              </Box>
              {/* Content card */}
              <Box
                sx={{
                  flex: 1,
                  p: 3,
                  borderRadius: 2,
                  bgcolor: "var(--mui-palette-background-paper)",
                  border: "1px solid var(--mui-palette-divider)",
                  transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
                  "&:hover": {
                    borderColor: "var(--mui-palette-secondary-main)",
                    boxShadow: "0 4px 16px rgba(184,115,51,0.08)",
                    transform: "translateX(4px)",
                  },
                }}
              >
                <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 17, mb: 0.5 }}>
                  {step.title}
                </Typography>
                <Typography variant="body2" sx={{ color: "var(--mui-palette-text-secondary)", lineHeight: 1.6 }}>
                  {step.desc}
                </Typography>
              </Box>
            </Stack>
          ))}
        </Stack>
      </Box>
    </SectionWrapper>
  );
}

// ─── How it works ───────────────────────────────────────────────────

function HowItWorksSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const steps = [
    { num: "1", title: t.howStep1Title, body: t.howStep1Body },
    { num: "2", title: t.howStep2Title, body: t.howStep2Body },
    { num: "3", title: t.howStep3Title, body: t.howStep3Body },
  ];

  const inViewRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [inViewState, setInViewState] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    for (let i = 0; i < steps.length; i++) {
      const el = inViewRefs.current[i];
      if (!el) continue;
      const obs = new IntersectionObserver(
        ([entry]) => {
          setInViewState(prev => ({ ...prev, [i]: entry.isIntersecting }));
        },
        { threshold: 0.5 }
      );
      obs.observe(el);
      observers.push(obs);
    }
    return () => {
      for (const o of observers) o.disconnect();
    };
  }, [steps.length]);

  return (
    <SectionWrapper badge={t.howBadge} title={t.howTitle} subtitle={t.howSubtitle} bg="default">
      <Box sx={{ position: "relative" }}>
        {/* Connecting line between step circles — md+ only */}
        <Box
          aria-hidden
          sx={{
            display: { xs: "none", md: "block" },
            position: "absolute",
            top: 27,
            left: "16.67%",
            right: "16.67%",
            height: 2,
            bgcolor: "var(--mui-palette-secondary-main)",
            opacity: 0.25,
            zIndex: 0,
          }}
        />
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
            gap: 3,
          }}
        >
          {steps.map((s, idx) => (
            <Stack key={s.num} spacing={2} sx={{ position: "relative", zIndex: 1 }}>
              <Box
                ref={(el: HTMLDivElement | null) => {
                  inViewRefs.current[idx] = el;
                }}
                className="step-circle-pulse"
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "var(--mui-palette-secondary-main)",
                  color: "var(--mui-palette-onSecondary)",
                  fontSize: 24,
                  fontWeight: 800,
                  boxShadow: inViewState[idx] ? "0 0 20px rgba(184,115,51,0.4)" : "0 6px 16px rgba(184,115,51,0.3)",
                  transform: inViewState[idx] ? "scale(1.1)" : "scale(1)",
                  transition: "box-shadow 0.4s ease, transform 0.4s ease",
                  position: "relative",
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    inset: -6,
                    borderRadius: "50%",
                    border: "2px solid var(--mui-palette-secondary-main)",
                    opacity: 0,
                    animation: "stepPulse 2.5s ease-in-out infinite",
                  },
                  "@keyframes stepPulse": {
                    "0%": { opacity: 0, transform: "scale(0.9)" },
                    "50%": { opacity: 0.3, transform: "scale(1.1)" },
                    "100%": { opacity: 0, transform: "scale(1.2)" },
                  },
                }}
              >
                {s.num}
              </Box>
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 18 }}>
                {s.title}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "var(--mui-palette-text-secondary)", lineHeight: 1.6, fontSize: 14 }}
              >
                {s.body}
              </Typography>
            </Stack>
          ))}
        </Box>
      </Box>
    </SectionWrapper>
  );
}

// ─── Achievements ────────────────────────────────────────────────────

function AchievementsSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const items = [
    { icon: <TrophyIcon />, value: t.achievement1Value, label: t.achievement1Label },
    { icon: <CertificateIcon />, value: t.achievement2Value, label: t.achievement2Label },
    { icon: <ClockIcon />, value: t.achievement3Value, label: t.achievement3Label },
    { icon: <StarRateIcon />, value: t.achievement4Value, label: t.achievement4Label },
    { icon: <GlobeIcon />, value: t.achievement5Value, label: t.achievement5Label },
    { icon: <QuranIcon />, value: t.achievement6Value, label: t.achievement6Label },
  ];

  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        overflow: "hidden",
        background:
          "linear-gradient(160deg, var(--mui-palette-primary-dark) 0%, var(--mui-palette-primary-main) 50%, var(--mui-palette-primary-dark) 100%)",
        color: "var(--mui-palette-onPrimary)",
        py: { xs: 8, md: 10 },
      }}
    >
      {/* Subtle pattern overlay */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.04,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 36px, var(--mui-palette-secondary-light) 36px, var(--mui-palette-secondary-light) 38px)",
        }}
      />

      <Container maxWidth="lg" sx={{ position: "relative", zIndex: 1 }}>
        {/* Section header */}
        <Stack spacing={1.5} sx={{ mb: 5, maxWidth: 640 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box aria-hidden sx={{ width: 24, height: 2, bgcolor: "var(--mui-palette-secondary-main)" }} />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--mui-palette-secondary-main)",
                lineHeight: 1,
              }}
            >
              {t.achievementsBadge}
            </Typography>
          </Stack>
          <Typography
            variant="h3"
            sx={{ fontWeight: 800, fontSize: { xs: 26, md: 34 }, letterSpacing: "-0.02em", lineHeight: 1.2, m: 0 }}
          >
            {t.achievementsTitle}
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.85, lineHeight: 1.6, fontSize: 16 }}>
            {t.achievementsSubtitle}
          </Typography>
        </Stack>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "1fr 1fr 1fr" },
            gap: 3,
          }}
        >
          {items.map(item => (
            <Stack
              key={item.label}
              spacing={2}
              sx={{
                p: 3,
                borderRadius: 3,
                border: "1px solid color-mix(in srgb, var(--mui-palette-secondary-main) 30%, transparent)",
                bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 10%, transparent)",
                backdropFilter: "blur(8px)",
                textAlign: "center",
                alignItems: "center",
                transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
                "&:hover": {
                  borderColor: "var(--mui-palette-secondary-main)",
                  boxShadow: "0 8px 24px rgba(184,115,51,0.15)",
                  transform: "translateY(-4px)",
                },
              }}
            >
              <Box
                sx={{
                  width: 52,
                  height: 52,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 15%, transparent)",
                  color: "var(--mui-palette-secondary-light)",
                  "& svg": { fontSize: 26 },
                }}
              >
                {item.icon}
              </Box>
              <Typography
                sx={{
                  fontSize: { xs: 28, md: 36 },
                  fontWeight: 800,
                  color: "var(--mui-palette-secondary-light)",
                  lineHeight: 1,
                  textShadow: "0 0 20px rgba(184,115,51,0.3)",
                }}
              >
                <AnimatedCounter raw={item.value} />
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.75, textTransform: "none", letterSpacing: "0.02em" }}>
                {item.label}
              </Typography>
            </Stack>
          ))}
        </Box>
      </Container>
    </Box>
  );
}

// ─── Roles ───────────────────────────────────────────────────────────

function RolesSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const roles = [
    {
      icon: <SchoolIcon />,
      title: t.roleStudentTitle,
      body: t.roleStudentBody,
      cta: t.roleStudentCta,
      href: "/register",
    },
    {
      icon: <PersonIcon />,
      title: t.roleTeacherTitle,
      body: t.roleTeacherBody,
      cta: t.roleTeacherCta,
      href: "/register",
    },
    { icon: <GroupsIcon />, title: t.roleParentTitle, body: t.roleParentBody, cta: t.roleParentCta, href: "/register" },
  ];

  return (
    <SectionWrapper badge={t.rolesBadge} title={t.rolesTitle} subtitle={t.rolesSubtitle} bg="paper">
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
          gap: 3,
        }}
      >
        {roles.map(r => (
          <Stack
            key={r.title}
            spacing={2}
            sx={{
              p: 4,
              borderRadius: 3,
              position: "relative",
              background:
                "linear-gradient(to bottom, transparent, color-mix(in srgb, var(--mui-palette-secondary-main) 3%, transparent))",
              bgcolor: "var(--mui-palette-background-default)",
              border: "1px solid var(--mui-palette-divider)",
              borderTop: "3px solid transparent",
              borderImage: "linear-gradient(90deg, var(--mui-palette-secondary-main) 0%, transparent 100%) 1",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
              "&::before": {
                content: '""',
                position: "absolute",
                inset: -1,
                borderRadius: 13,
                background:
                  "conic-gradient(var(--mui-palette-secondary-main), transparent 25%, transparent 75%, var(--mui-palette-secondary-main))",
                opacity: 0,
                transition: "opacity 0.4s ease",
                pointerEvents: "none",
                zIndex: 0,
                animation: "rolesBorderSpin 6s linear infinite",
                "@keyframes rolesBorderSpin": {
                  "0%": { transform: "rotate(0deg)" },
                  "100%": { transform: "rotate(360deg)" },
                },
              },
              "&:hover": {
                borderColor: "var(--mui-palette-secondary-main)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
                transform: "translateY(-4px)",
                "&::before": { opacity: 0.5 },
              },
              height: "100%",
              overflow: "visible",
            }}
          >
            <Box
              sx={{
                width: 52,
                height: 52,
                borderRadius: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "var(--mui-palette-primary-main)",
                color: "var(--mui-palette-onPrimary)",
                position: "relative",
                zIndex: 1,
                animation: "iconFloat 3s ease-in-out infinite",
                "@keyframes iconFloat": {
                  "0%, 100%": { transform: "translateY(-2px)" },
                  "50%": { transform: "translateY(2px)" },
                },
                "& svg": { fontSize: 28 },
              }}
            >
              {r.icon}
            </Box>
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: 20 }}>
              {r.title}
            </Typography>
            <Typography variant="body2" sx={{ color: "var(--mui-palette-text-secondary)", lineHeight: 1.6, flex: 1 }}>
              {r.body}
            </Typography>
            <Button
              component={Link}
              href={r.href}
              variant="text"
              sx={{
                alignSelf: "flex-start",
                color: "var(--mui-palette-secondary-main)",
                fontWeight: 700,
                textTransform: "none",
                p: 0,
                "&:hover": { bgcolor: "transparent", textDecoration: "underline" },
              }}
            >
              {r.cta} →
            </Button>
          </Stack>
        ))}
      </Box>
    </SectionWrapper>
  );
}

// ─── Pricing section ────────────────────────────────────────────────

/**
 * One pricing tier card — extracted so PricingSection stays under the
 * sonarjs cognitive-complexity ceiling (the per-plan ternary tree lives
 * here at depth 1). Translations resolve via the shared Landing handle.
 */
/**
 * Module-level style variants for the pricing card — the popular/standard
 * ternary tree collapsed into two single lookups so the component stays far
 * under the sonarjs cognitive-complexity ceiling. All colors are palette
 * CSS variables (sx-only; no raw hex outside the brand shadow constants
 * already in use across this page).
 */
const POPULAR_CARD_SX = {
  p: 4,
  borderRadius: 3,
  bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 6%, var(--mui-palette-background-paper))",
  border: "2px solid var(--mui-palette-secondary-main)",
  boxShadow: "0 12px 32px rgba(184,115,51,0.18)",
  transform: "translateY(-8px)",
  position: "relative",
  transition: "box-shadow 0.2s ease, transform 0.2s ease, border-color 0.2s ease",
  height: "100%",
  overflow: "hidden",
  animation: "pricingScaleIn 0.3s ease",
  "@keyframes pricingScaleIn": {
    "0%": { transform: "translateY(-8px) scale(0.97)" },
    "100%": { transform: "translateY(-8px) scale(1)" },
  },
} as const;

const STANDARD_CARD_SX = {
  ...POPULAR_CARD_SX,
  bgcolor: "var(--mui-palette-background-paper)",
  border: "1px solid var(--mui-palette-divider)",
  boxShadow: "none",
  transform: "none",
  "&:hover": {
    borderColor: "var(--mui-palette-secondary-main)",
    boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
    transform: "translateY(-4px)",
  },
  "@keyframes pricingScaleIn": {
    "0%": { transform: "scale(0.97)" },
    "100%": { transform: "scale(1)" },
  },
} as const;

const POPULAR_CTA_SX = {
  position: "relative",
  zIndex: 1,
  overflow: "hidden",
  bgcolor: "var(--mui-palette-secondary-main)",
  color: "var(--mui-palette-onSecondary)",
  borderColor: "transparent",
  fontWeight: 700,
  textTransform: "none",
  borderRadius: 2,
  py: 1.5,
  minHeight: 44,
  "&::after": {
    content: '""',
    position: "absolute",
    top: 0,
    left: "-100%",
    width: "100%",
    height: "100%",
    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
    transition: "left 0.5s ease",
  },
  "&:hover": {
    bgcolor: "var(--mui-palette-secondary-dark)",
    borderColor: "transparent",
    "&::after": { left: "100%" },
  },
} as const;

const STANDARD_CTA_SX = {
  position: "relative",
  zIndex: 1,
  overflow: "visible",
  bgcolor: "transparent",
  color: "var(--mui-palette-secondary-main)",
  borderColor: "var(--mui-palette-secondary-main)",
  fontWeight: 700,
  textTransform: "none",
  borderRadius: 2,
  py: 1.5,
  minHeight: 44,
  "&:hover": {
    bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 8%, transparent)",
    borderColor: "var(--mui-palette-secondary-dark)",
  },
} as const;

function PricingPlanCard({ plan }: Readonly<{ plan: PricingPlanView }>): ReactNode {
  const t = useAppTranslation(Landing);
  const popular = plan.popular;

  return (
    <Stack spacing={3} sx={popular ? POPULAR_CARD_SX : STANDARD_CARD_SX}>
      {/* Shimmer effect for popular plan */}
      {popular ? (
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            top: 0,
            left: "-100%",
            width: "100%",
            height: "100%",
            background: "linear-gradient(90deg, transparent, rgba(184,115,51,0.06), transparent)",
            animation: "pricingShimmer 3s ease-in-out infinite",
            pointerEvents: "none",
            "@keyframes pricingShimmer": {
              "0%": { left: "-100%" },
              "100%": { left: "100%" },
            },
          }}
        />
      ) : null}

      {popular ? (
        <Box
          sx={{
            position: "relative",
            zIndex: 1,
            top: -12,
            insetInlineStart: "50%",
            transform: "translateX(-50%)",
            px: 2,
            py: 0.5,
            borderRadius: 99,
            bgcolor: "var(--mui-palette-secondary-main)",
            color: "var(--mui-palette-onSecondary)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.04em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {t.pricingPlanProPopular}
        </Box>
      ) : null}

      <Typography
        variant="h6"
        sx={{
          position: "relative",
          zIndex: 1,
          fontWeight: 700,
          fontSize: 20,
          color: popular ? "var(--mui-palette-secondary-main)" : "var(--mui-palette-text-primary)",
        }}
      >
        {plan.name}
      </Typography>

      <Box sx={{ position: "relative", zIndex: 1 }}>
        <Typography
          sx={{
            fontSize: 48,
            fontWeight: 800,
            lineHeight: 1,
            color: popular ? "var(--mui-palette-secondary-main)" : "var(--mui-palette-text-primary)",
            letterSpacing: "-0.03em",
          }}
        >
          {plan.price}
          {plan.price !== t.pricingPlanFreePrice && (
            <Box component="span" sx={{ fontSize: 18, fontWeight: 500, opacity: 0.7 }}>
              {t.pricingMonthly}
            </Box>
          )}
        </Typography>
        <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", mt: 0.5 }}>
          {plan.priceNote}
        </Typography>
      </Box>

      <Box sx={{ flex: 1, position: "relative", zIndex: 1 }}>
        {plan.features.map(feat => (
          <Stack key={feat} direction="row" spacing={1.5} sx={{ py: 0.75 }}>
            <CheckIcon
              sx={{
                fontSize: 18,
                color: "var(--mui-palette-secondary-main)",
                flexShrink: 0,
                mt: 0.25,
              }}
            />
            <Typography variant="body2" sx={{ lineHeight: 1.5, color: "var(--mui-palette-text-secondary)" }}>
              {feat}
            </Typography>
          </Stack>
        ))}
      </Box>

      <Button
        component={Link}
        href="/register"
        variant={popular ? "contained" : "outlined"}
        fullWidth
        sx={popular ? POPULAR_CTA_SX : STANDARD_CTA_SX}
      >
        {plan.cta}
      </Button>
    </Stack>
  );
}

/** Canonical shape of a pricing tier after yearly/monthly resolution. */
interface PricingPlanView {
  readonly name: string;
  readonly price: string;
  readonly priceNote: string;
  readonly features: readonly string[];
  readonly cta: string;
  readonly popular: boolean;
}

function PricingSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const [yearly, setYearly] = useState(false);

  const plans = useMemo(
    () => [
      {
        name: t.pricingPlanFreeName,
        price: t.pricingPlanFreePrice,
        priceNote: yearly ? t.pricingPlanFreePriceNoteYearly : t.pricingPlanFreePriceNote,
        features: [t.pricingPlanFreeF1, t.pricingPlanFreeF2, t.pricingPlanFreeF3, t.pricingPlanFreeF4],
        cta: t.pricingPlanFreeCta,
        popular: false,
      },
      {
        name: t.pricingPlanProName,
        price: yearly ? t.pricingPlanProPriceYearly : t.pricingPlanProPrice,
        priceNote: yearly ? t.pricingPlanProPriceNoteYearly : t.pricingPlanProPriceNote,
        features: [t.pricingPlanProF1, t.pricingPlanProF2, t.pricingPlanProF3, t.pricingPlanProF4, t.pricingPlanProF5],
        cta: t.pricingPlanProCta,
        popular: true,
      },
      {
        name: t.pricingPlanFamilyName,
        price: yearly ? t.pricingPlanFamilyPriceYearly : t.pricingPlanFamilyPrice,
        priceNote: yearly ? t.pricingPlanFamilyPriceNoteYearly : t.pricingPlanFamilyPriceNote,
        features: [
          t.pricingPlanFamilyF1,
          t.pricingPlanFamilyF2,
          t.pricingPlanFamilyF3,
          t.pricingPlanFamilyF4,
          t.pricingPlanFamilyF5,
          t.pricingPlanFamilyF6,
        ],
        cta: t.pricingPlanFamilyCta,
        popular: false,
      },
    ],
    [
      yearly,
      t.pricingPlanFreeName,
      t.pricingPlanFreePrice,
      t.pricingPlanFreePriceNote,
      t.pricingPlanFreePriceNoteYearly,
      t.pricingPlanFreeF1,
      t.pricingPlanFreeF2,
      t.pricingPlanFreeF3,
      t.pricingPlanFreeF4,
      t.pricingPlanFreeCta,
      t.pricingPlanProName,
      t.pricingPlanProPrice,
      t.pricingPlanProPriceYearly,
      t.pricingPlanProPriceNote,
      t.pricingPlanProPriceNoteYearly,
      t.pricingPlanProF1,
      t.pricingPlanProF2,
      t.pricingPlanProF3,
      t.pricingPlanProF4,
      t.pricingPlanProF5,
      t.pricingPlanProCta,
      t.pricingPlanFamilyName,
      t.pricingPlanFamilyPrice,
      t.pricingPlanFamilyPriceYearly,
      t.pricingPlanFamilyPriceNote,
      t.pricingPlanFamilyPriceNoteYearly,
      t.pricingPlanFamilyF1,
      t.pricingPlanFamilyF2,
      t.pricingPlanFamilyF3,
      t.pricingPlanFamilyF4,
      t.pricingPlanFamilyF5,
      t.pricingPlanFamilyF6,
      t.pricingPlanFamilyCta,
    ]
  );

  return (
    <SectionWrapper badge={t.pricingBadge} title={t.pricingTitle} subtitle={t.pricingSubtitle} bg="default">
      {/* Billing period toggle */}
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: "center",
          justifyContent: "center",
          mb: 4,
        }}
      >
        <Chip
          label={t.pricingYearlyDiscount}
          size="small"
          sx={{
            bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 12%, transparent)",
            color: "var(--mui-palette-secondary-main)",
            fontWeight: 600,
            fontSize: 12,
          }}
        />
        <Box
          sx={{
            display: "flex",
            borderRadius: 99,
            border: "1px solid var(--mui-palette-divider)",
            p: 0.25,
          }}
        >
          <Button
            onClick={() => setYearly(false)}
            sx={{
              borderRadius: 99,
              px: 2,
              py: 1,
              minHeight: 44,
              fontWeight: 600,
              textTransform: "none",
              fontSize: 14,
              bgcolor: !yearly ? "var(--mui-palette-secondary-main)" : "transparent",
              color: !yearly ? "var(--mui-palette-onSecondary)" : "var(--mui-palette-text-secondary)",
              transition: "all 0.25s ease",
              "&:hover": {
                bgcolor: !yearly
                  ? "var(--mui-palette-secondary-dark)"
                  : "color-mix(in srgb, var(--mui-palette-secondary-main) 10%, transparent)",
              },
            }}
          >
            {t.pricingToggleMonthly}
          </Button>
          <Button
            onClick={() => setYearly(true)}
            sx={{
              borderRadius: 99,
              px: 2,
              py: 1,
              minHeight: 44,
              fontWeight: 600,
              textTransform: "none",
              fontSize: 14,
              bgcolor: yearly ? "var(--mui-palette-secondary-main)" : "transparent",
              color: yearly ? "var(--mui-palette-onSecondary)" : "var(--mui-palette-text-secondary)",
              transition: "all 0.25s ease",
              "&:hover": {
                bgcolor: yearly
                  ? "var(--mui-palette-secondary-dark)"
                  : "color-mix(in srgb, var(--mui-palette-secondary-main) 10%, transparent)",
              },
            }}
          >
            {t.pricingToggleYearly}
          </Button>
        </Box>
      </Stack>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" },
          gap: 3,
          alignItems: "start",
        }}
      >
        {plans.map(plan => (
          <PricingPlanCard key={plan.name} plan={plan} />
        ))}
      </Box>
    </SectionWrapper>
  );
}

// ─── Testimonials ────────────────────────────────────────────────────

function TestimonialsSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const [current, setCurrent] = useState(0);
  const testimonials = [
    { quote: t.testimonial1Quote, name: t.testimonial1Name, role: t.testimonial1Role },
    { quote: t.testimonial2Quote, name: t.testimonial2Name, role: t.testimonial2Role },
    { quote: t.testimonial3Quote, name: t.testimonial3Name, role: t.testimonial3Role },
  ];
  const total = testimonials.length;

  const handlePrev = useCallback(() => {
    setCurrent(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrent(prev => Math.min(total - 1, prev + 1));
  }, [total]);

  return (
    <SectionWrapper
      badge={t.testimonialsBadge}
      title={t.testimonialsTitle}
      subtitle={t.testimonialsSubtitle}
      bg="default"
    >
      <Box sx={{ position: "relative" }}>
        {/* Previous button */}
        <IconButton
          aria-label={t.testimonialPrev}
          onClick={handlePrev}
          disabled={current === 0}
          sx={{
            position: "absolute",
            top: "50%",
            left: { xs: -8, md: -48 },
            transform: "translateY(-50%)",
            zIndex: 2,
            width: 44,
            height: 44,
            border: "2px solid var(--mui-palette-secondary-main)",
            borderRadius: "50%",
            color: "var(--mui-palette-secondary-main)",
            "&:hover": {
              bgcolor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-onSecondary)",
            },
            "&:disabled": {
              opacity: 0.3,
              borderColor: "var(--mui-palette-divider)",
              color: "var(--mui-palette-text-disabled)",
            },
          }}
        >
          <KeyboardArrowLeft />
        </IconButton>

        {/* Next button */}
        <IconButton
          aria-label={t.testimonialNext}
          onClick={handleNext}
          disabled={current === total - 1}
          sx={{
            position: "absolute",
            top: "50%",
            right: { xs: -8, md: -48 },
            transform: "translateY(-50%)",
            zIndex: 2,
            width: 44,
            height: 44,
            border: "2px solid var(--mui-palette-secondary-main)",
            borderRadius: "50%",
            color: "var(--mui-palette-secondary-main)",
            "&:hover": {
              bgcolor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-onSecondary)",
            },
            "&:disabled": {
              opacity: 0.3,
              borderColor: "var(--mui-palette-divider)",
              color: "var(--mui-palette-text-disabled)",
            },
          }}
        >
          <KeyboardArrowRight />
        </IconButton>

        {/* Carousel viewport */}
        <Box sx={{ overflow: "hidden" }}>
          <Box
            sx={{
              display: "flex",
              transition: "transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)",
              transform: `translateX(-${current * 100}%)`,
            }}
          >
            {testimonials.map(item => (
              <Box
                key={item.name}
                sx={{
                  minWidth: "100%",
                  display: "flex",
                  justifyContent: "center",
                  px: { xs: 1, md: 6 },
                }}
              >
                <Box
                  sx={{
                    position: "relative",
                    p: 4,
                    borderRadius: 3,
                    bgcolor: "var(--mui-palette-background-paper)",
                    border: "1px solid var(--mui-palette-divider)",
                    maxWidth: 500,
                    width: "100%",
                    transition: "border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease",
                    overflow: "hidden",
                    "&:hover": {
                      borderColor: "var(--mui-palette-secondary-main)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
                      transform: "translateY(-4px)",
                      "&::before": { opacity: 1 },
                      "& .testimonialQuote": { opacity: 0.35 },
                    },
                    "&::before": {
                      content: '""',
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: "50%",
                      background:
                        "linear-gradient(to bottom, color-mix(in srgb, var(--mui-palette-secondary-main) 0.08), transparent)",
                      opacity: 0,
                      transition: "opacity 0.3s ease",
                      pointerEvents: "none",
                    },
                  }}
                >
                  {/* Decorative quotation mark */}
                  <Typography
                    aria-hidden
                    className="testimonialQuote"
                    sx={{
                      position: "absolute",
                      top: 8,
                      left: 12,
                      fontSize: 80,
                      lineHeight: 1,
                      fontWeight: 800,
                      color: "var(--mui-palette-secondary-main)",
                      opacity: 0.15,
                      pointerEvents: "none",
                      userSelect: "none",
                      transition: "opacity 0.3s ease",
                    }}
                  >
                    “
                  </Typography>

                  {/* Star ratings */}
                  <Stack direction="row" spacing={0.25} sx={{ mb: 2, position: "relative", zIndex: 1 }}>
                    <Star sx={{ fontSize: 18, color: "var(--mui-palette-secondary-main)" }} />
                    <Star sx={{ fontSize: 18, color: "var(--mui-palette-secondary-main)" }} />
                    <Star sx={{ fontSize: 18, color: "var(--mui-palette-secondary-main)" }} />
                    <Star sx={{ fontSize: 18, color: "var(--mui-palette-secondary-main)" }} />
                    <Star sx={{ fontSize: 18, color: "var(--mui-palette-secondary-main)" }} />
                  </Stack>

                  <Typography
                    variant="body1"
                    sx={{
                      fontStyle: "italic",
                      lineHeight: 1.7,
                      mb: 2.5,
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    {item.quote}
                  </Typography>

                  {/* Copper divider */}
                  <Box
                    aria-hidden
                    sx={{
                      width: 40,
                      height: 2,
                      bgcolor: "var(--mui-palette-secondary-main)",
                      mb: 2,
                    }}
                  />

                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                    {/* Avatar circle with initial */}
                    <Box
                      sx={{
                        width: 36,
                        height: 36,
                        borderRadius: "50%",
                        bgcolor: "var(--mui-palette-secondary-main)",
                        color: "var(--mui-palette-onSecondary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 700,
                        fontSize: 15,
                        flexShrink: 0,
                      }}
                    >
                      {item.name.charAt(0)}
                    </Box>
                    <Box>
                      <Typography sx={{ fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>{item.name}</Typography>
                      <Typography variant="caption" sx={{ opacity: 0.7, lineHeight: 1.3 }}>
                        {item.role}
                      </Typography>
                    </Box>
                  </Stack>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Dot indicators — touch target floor 44×44 (WCAG AAA) while the
            visible dot stays small for a clean carousel look. */}
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: "center", mt: 3 }}>
          {testimonials.map((_item, idx) => (
            <Box
              key={_item.name}
              component="button"
              type="button"
              onClick={() => setCurrent(idx)}
              aria-label={`Testimonial ${idx + 1}`}
              sx={{
                minWidth: 44,
                minHeight: 44,
                p: 0,
                border: "none",
                bgcolor: "transparent",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                "&:focus-visible": {
                  outline: "2px solid var(--mui-palette-secondary-main)",
                  outlineOffset: 2,
                  borderRadius: 1,
                },
              }}
            >
              <Box
                aria-hidden
                sx={{
                  width: idx === current ? 24 : 8,
                  height: 8,
                  borderRadius: 99,
                  bgcolor: idx === current ? "var(--mui-palette-secondary-main)" : "transparent",
                  border: idx === current ? "none" : "2px solid var(--mui-palette-secondary-main)",
                  transition: "all 0.3s ease",
                }}
              />
            </Box>
          ))}
        </Stack>
      </Box>
    </SectionWrapper>
  );
}

// ─── FAQ ─────────────────────────────────────────────────────────────

function FaqSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const faqList = useMemo(
    () => [
      { id: "faq-1", q: t.faq1Question, a: t.faq1Answer, num: "01" },
      { id: "faq-2", q: t.faq2Question, a: t.faq2Answer, num: "02" },
      { id: "faq-3", q: t.faq3Question, a: t.faq3Answer, num: "03" },
      { id: "faq-4", q: t.faq4Question, a: t.faq4Answer, num: "04" },
      { id: "faq-5", q: t.faq5Question, a: t.faq5Answer, num: "05" },
    ],
    [
      t.faq1Question,
      t.faq1Answer,
      t.faq2Question,
      t.faq2Answer,
      t.faq3Question,
      t.faq3Answer,
      t.faq4Question,
      t.faq4Answer,
      t.faq5Question,
      t.faq5Answer,
    ]
  );

  const allExpanded = expandedIds.size === faqList.length;
  const handleToggleAll = useCallback(() => {
    if (allExpanded) {
      setExpandedIds(new Set());
    } else {
      setExpandedIds(new Set(faqList.map(f => f.id)));
    }
  }, [allExpanded, faqList]);

  const handleAccordionChange = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  return (
    <SectionWrapper badge={t.faqBadge} title={t.faqTitle} subtitle={t.faqSubtitle} bg="paper">
      <Stack spacing={2} sx={{ maxWidth: 800, mx: "auto" }}>
        <Stack direction="row" sx={{ justifyContent: "flex-end" }}>
          <Button
            onClick={handleToggleAll}
            sx={{
              color: "var(--mui-palette-secondary-main)",
              textTransform: "none",
              fontWeight: 600,
              fontSize: 13,
              p: 1,
              minHeight: 44,
              "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 8%, transparent)" },
            }}
          >
            {allExpanded ? t.faqCollapseAll : t.faqExpandAll}
          </Button>
        </Stack>
        <Box>
          {faqList.map(faq => (
            <Accordion
              key={faq.id}
              disableGutters
              expanded={expandedIds.has(faq.id)}
              onChange={() => handleAccordionChange(faq.id)}
              sx={{
                bgcolor: "var(--mui-palette-background-paper)",
                border: "1px solid var(--mui-palette-divider)",
                borderRadius: "8px !important",
                "&:before": { display: "none" },
                "&:first-of-type": { mt: 0 },
                "& + &": { mt: 1.5 },
                transition: "box-shadow 0.2s ease",
                "&.Mui-expanded": {
                  boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                  margin: 0,
                  "& + &": { mt: 1.5 },
                },
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMore sx={{ color: "var(--mui-palette-secondary-main)" }} />}
                sx={{
                  "& .MuiAccordionSummary-content": { my: 2 },
                }}
              >
                <Stack direction="row" spacing={2} sx={{ alignItems: "center", flex: 1 }}>
                  <Typography
                    variant="overline"
                    sx={{
                      fontWeight: 800,
                      fontSize: 14,
                      color: "var(--mui-palette-secondary-main)",
                      lineHeight: 1,
                      letterSpacing: "0.02em",
                      flexShrink: 0,
                    }}
                  >
                    {faq.num}
                  </Typography>
                  <Typography sx={{ fontWeight: 600, fontSize: 16, lineHeight: 1.4 }}>{faq.q}</Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails
                sx={{
                  variant: "body2",
                  lineHeight: 1.7,
                  color: "var(--mui-palette-text-secondary)",
                  px: 3,
                  pb: 3,
                }}
              >
                <Typography
                  variant="body2"
                  sx={{ lineHeight: 1.7, color: "var(--mui-palette-text-secondary)", pl: 5.5 }}
                >
                  {faq.a}
                </Typography>
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Stack>
    </SectionWrapper>
  );
}

// ─── Newsletter CTA ──────────────────────────────────────────────────

function NewsletterSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(false);

  const handleNewsletterSubmit = useCallback(
    (e: SyntheticEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!isEmailLike(email)) {
        setError(true);
        return;
      }
      setError(false);
      setLoading(true);
      setTimeout(() => {
        setLoading(false);
        setSuccess(true);
      }, 1500);
    },
    [email]
  );

  if (success) {
    return (
      <Box
        component="section"
        sx={{
          position: "relative",
          bgcolor: "var(--mui-palette-background-paper)",
          py: { xs: 6, md: 10 },
          pl: 3,
          "&::before": {
            content: '""',
            position: "absolute",
            top: 0,
            left: 0,
            bottom: 0,
            width: 5,
            background: "linear-gradient(to bottom, var(--mui-palette-secondary-main), transparent)",
            animation: "newsletterBorderPulse 2s ease-in-out infinite",
            "@keyframes newsletterBorderPulse": {
              "0%, 100%": { opacity: 0.7 },
              "50%": { opacity: 1 },
            },
          },
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={3} sx={{ alignItems: "center", textAlign: "center", maxWidth: 560, mx: "auto" }}>
            <CheckIcon sx={{ fontSize: 48, color: "var(--mui-palette-secondary-main)" }} />
            <Typography
              variant="h3"
              sx={{ fontWeight: 800, fontSize: { xs: 26, md: 34 }, letterSpacing: "-0.02em", lineHeight: 1.2, m: 0 }}
            >
              {t.newsletterSuccess}
            </Typography>
          </Stack>
        </Container>
      </Box>
    );
  }

  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        bgcolor: "var(--mui-palette-background-paper)",
        py: { xs: 6, md: 10 },
        pl: 3,
        "&::before": {
          content: '""',
          position: "absolute",
          top: 0,
          left: 0,
          bottom: 0,
          width: 5,
          background: "linear-gradient(to bottom, var(--mui-palette-secondary-main), transparent)",
          animation: "newsletterBorderPulse 2s ease-in-out infinite",
          "@keyframes newsletterBorderPulse": {
            "0%, 100%": { opacity: 0.7 },
            "50%": { opacity: 1 },
          },
        },
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={3} sx={{ alignItems: "center", textAlign: "center", maxWidth: 560, mx: "auto" }}>
          {/* Badge */}
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              px: 2,
              py: 0.75,
              borderRadius: 99,
              border: "1px solid var(--mui-palette-secondary-main)",
              bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 10%, transparent)",
            }}
          >
            <Box
              aria-hidden
              sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "var(--mui-palette-secondary-light)" }}
            />
            <Typography
              variant="caption"
              sx={{ fontWeight: 700, letterSpacing: "0.12em", color: "var(--mui-palette-secondary-main)" }}
            >
              {t.newsletterBadge}
            </Typography>
          </Stack>

          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <MailIcon sx={{ fontSize: 32, color: "var(--mui-palette-secondary-main)" }} />
            <Typography
              variant="h3"
              sx={{ fontWeight: 800, fontSize: { xs: 26, md: 34 }, letterSpacing: "-0.02em", lineHeight: 1.2, m: 0 }}
            >
              {t.newsletterTitle}
            </Typography>
          </Stack>

          <Typography
            variant="body1"
            sx={{ color: "var(--mui-palette-text-secondary)", lineHeight: 1.6, fontSize: 16 }}
          >
            {t.newsletterSubtitle}
          </Typography>

          {/* Email input row */}
          <Box component="form" onSubmit={handleNewsletterSubmit} sx={{ width: "100%", mt: 1 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <MuiTextField
                fullWidth
                placeholder={t.newsletterPlaceholder}
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setError(false);
                }}
                variant="outlined"
                type="email"
                size="small"
                error={error}
                helperText={error ? t.newsletterError : undefined}
                sx={{
                  bgcolor: "var(--mui-palette-background-default)",
                  borderRadius: 2,
                  "& .MuiOutlinedInput-root": {
                    borderRadius: 2,
                    "& fieldset": {
                      borderColor: error ? "var(--mui-palette-error-main)" : "var(--mui-palette-divider)",
                      transition: "border-color 0.2s ease, box-shadow 0.2s ease",
                    },
                    "&:hover fieldset": {
                      borderColor: error ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
                    },
                    "&.Mui-focused fieldset": {
                      borderColor: error ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
                      ...(error
                        ? {}
                        : {
                            animation: "pulseInputBorder 2s ease-in-out infinite",
                            "@keyframes pulseInputBorder": {
                              "0%, 100%": { boxShadow: "0 0 0 0 rgba(184,115,51,0.3)" },
                              "50%": { boxShadow: "0 0 0 4px rgba(184,115,51,0.08)" },
                            },
                          }),
                    },
                  },
                }}
              />
              <Button
                type="submit"
                variant="contained"
                disabled={loading}
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  bgcolor: "var(--mui-palette-secondary-main)",
                  color: "var(--mui-palette-onSecondary)",
                  fontWeight: 700,
                  textTransform: "none",
                  borderRadius: 2,
                  px: 3,
                  minHeight: 44,
                  whiteSpace: "nowrap",
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: "-100%",
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                    transition: "left 0.5s ease",
                  },
                  "&:hover": {
                    bgcolor: "var(--mui-palette-secondary-dark)",
                    "&::after": { left: "100%" },
                  },
                }}
              >
                {loading ? <CircularProgress size={20} color="inherit" /> : t.newsletterButton}
              </Button>
            </Stack>
          </Box>

          <Typography variant="caption" sx={{ opacity: 0.6, mt: 1 }}>
            {t.newsletterDisclaimer}
          </Typography>
        </Stack>
      </Container>
    </Box>
  );
}

// ─── Contact section ────────────────────────────────────────────────

function ContactSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [snackOpen, setSnackOpen] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [messageError, setMessageError] = useState(false);

  const handleSubmit = (e: SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    let valid = true;
    if (!isEmailLike(email)) {
      setEmailError(true);
      valid = false;
    } else {
      setEmailError(false);
    }
    if (message.length < 10) {
      setMessageError(true);
      valid = false;
    } else {
      setMessageError(false);
    }
    if (!valid) return;
    setEmail("");
    setMessage("");
    setSnackOpen(true);
  };

  return (
    <SectionWrapper badge={t.contactBadge} title={t.contactTitle} subtitle={t.contactSubtitle} bg="default">
      <Box component="form" onSubmit={handleSubmit} sx={{ maxWidth: 600, mx: "auto" }}>
        <Stack spacing={2.5}>
          <MuiTextField
            fullWidth
            label={t.contactEmailLabel}
            placeholder={t.contactEmailPlaceholder}
            value={email}
            onChange={e => {
              setEmail(e.target.value);
              setEmailError(false);
            }}
            variant="outlined"
            type="email"
            required
            error={emailError}
            helperText={emailError ? t.contactEmailError : undefined}
            sx={{
              bgcolor: "var(--mui-palette-background-paper)",
              borderRadius: 2,
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                "& fieldset": {
                  borderColor: emailError ? "var(--mui-palette-error-main)" : "var(--mui-palette-divider)",
                },
                "&:hover fieldset": {
                  borderColor: emailError ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: emailError ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
                },
              },
              "& .MuiInputLabel-root.Mui-focused": {
                color: emailError ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
              },
            }}
          />
          <MuiTextField
            fullWidth
            label={t.contactMessageLabel}
            placeholder={t.contactMessagePlaceholder}
            value={message}
            onChange={e => {
              setMessage(e.target.value);
              setMessageError(false);
            }}
            variant="outlined"
            multiline
            rows={4}
            required
            slotProps={{ htmlInput: { maxLength: 500 } }}
            error={messageError}
            helperText={messageError ? t.contactMessageError : undefined}
            sx={{
              bgcolor: "var(--mui-palette-background-paper)",
              borderRadius: 2,
              "& .MuiOutlinedInput-root": {
                borderRadius: 2,
                "& fieldset": {
                  borderColor: messageError ? "var(--mui-palette-error-main)" : "var(--mui-palette-divider)",
                },
                "&:hover fieldset": {
                  borderColor: messageError ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
                },
                "&.Mui-focused fieldset": {
                  borderColor: messageError ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
                },
              },
              "& .MuiInputLabel-root.Mui-focused": {
                color: messageError ? "var(--mui-palette-error-main)" : "var(--mui-palette-secondary-main)",
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{
              alignSelf: "flex-end",
              color: message.length > 450 ? "var(--mui-palette-warning-main)" : "var(--mui-palette-text-secondary)",
              opacity: 0.7,
            }}
          >
            {message.length}/500
          </Typography>
          <Button
            type="submit"
            variant="contained"
            size="large"
            sx={{
              position: "relative",
              overflow: "hidden",
              bgcolor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-onSecondary)",
              fontWeight: 700,
              textTransform: "none",
              borderRadius: 2,
              px: 4,
              py: 1.5,
              minHeight: 44,
              "&::after": {
                content: '""',
                position: "absolute",
                top: 0,
                left: "-100%",
                width: "100%",
                height: "100%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                transition: "left 0.5s ease",
              },
              "&:hover": {
                bgcolor: "var(--mui-palette-secondary-dark)",
                "&::after": { left: "100%" },
              },
            }}
          >
            {t.contactButton}
          </Button>
        </Stack>
      </Box>

      <Snackbar
        open={snackOpen}
        autoHideDuration={5000}
        onClose={() => setSnackOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackOpen(false)}
          severity="success"
          sx={{
            borderRadius: 2,
            fontWeight: 600,
          }}
        >
          {t.contactSuccessMessage}
        </Alert>
      </Snackbar>
    </SectionWrapper>
  );
}

// ─── Mobile App section ──────────────────────────────────────────

function MobileAppSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const appFeatures = [t.appF1, t.appF2, t.appF3, t.appF4];

  return (
    <SectionWrapper badge={t.appBadge} title={t.appTitle} subtitle={t.appSubtitle} bg="paper">
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 6,
          alignItems: "center",
        }}
      >
        <Box sx={{ display: { xs: "none", md: "flex" }, justifyContent: "center" }}>
          <Box
            sx={{
              width: 220,
              height: 440,
              borderRadius: 4,
              border: "3px solid var(--mui-palette-divider)",
              bgcolor: "var(--mui-palette-background-default)",
              position: "relative",
              overflow: "hidden",
              animation: "phoneFloat 4s ease-in-out infinite",
              boxShadow: "0 16px 40px rgba(0,0,0,0.15)",
              "@keyframes phoneFloat": {
                "0%, 100%": { transform: "rotate(-3deg) translateY(0)" },
                "50%": { transform: "rotate(-3deg) translateY(-12px)" },
              },
            }}
          >
            <Box
              aria-hidden
              sx={{
                position: "absolute",
                top: 6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 48,
                height: 5,
                borderRadius: 99,
                bgcolor: "var(--mui-palette-secondary-main)",
                zIndex: 2,
              }}
            />
            <Box
              aria-hidden
              sx={{
                height: 50,
                background:
                  "linear-gradient(135deg, var(--mui-palette-primary-dark) 0%, var(--mui-palette-primary-main) 100%)",
              }}
            />
            <Box aria-hidden sx={{ height: 3, bgcolor: "var(--mui-palette-secondary-main)" }} />
            <Stack spacing={2} sx={{ p: 2.5 }}>
              {/* Teacher profile card */}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid var(--mui-palette-divider)",
                  bgcolor: "var(--mui-palette-background-paper)",
                }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Box
                    sx={{
                      width: 24,
                      height: 24,
                      borderRadius: "50%",
                      bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 25%, transparent)",
                      flexShrink: 0,
                    }}
                  />
                  <Box sx={{ flex: 1 }}>
                    <Box
                      sx={{
                        height: 5,
                        width: "60%",
                        borderRadius: 0.5,
                        bgcolor: "var(--mui-palette-text-secondary)",
                        opacity: 0.3,
                      }}
                    />
                    <Box
                      sx={{
                        height: 4,
                        width: "40%",
                        borderRadius: 0.5,
                        bgcolor: "var(--mui-palette-text-secondary)",
                        opacity: 0.2,
                        mt: 0.5,
                      }}
                    />
                  </Box>
                </Stack>
              </Box>
              {/* Progress card */}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid var(--mui-palette-divider)",
                  bgcolor: "var(--mui-palette-background-paper)",
                }}
              >
                <Box
                  sx={{
                    height: 5,
                    width: "70%",
                    borderRadius: 0.5,
                    bgcolor: "var(--mui-palette-text-secondary)",
                    opacity: 0.3,
                    mb: 1,
                  }}
                />
                <Box
                  sx={{
                    height: 4,
                    width: "50%",
                    borderRadius: 0.5,
                    bgcolor: "var(--mui-palette-text-secondary)",
                    opacity: 0.2,
                    mb: 1.5,
                  }}
                />
                <Box sx={{ height: 4, borderRadius: 2, bgcolor: "var(--mui-palette-divider)" }}>
                  <Box
                    sx={{
                      width: "60%",
                      height: "100%",
                      borderRadius: 2,
                      background:
                        "linear-gradient(90deg, var(--mui-palette-secondary-main), var(--mui-palette-secondary-light))",
                    }}
                  />
                </Box>
              </Box>
              {/* Calendar card */}
              <Box
                sx={{
                  p: 1.5,
                  borderRadius: 2,
                  border: "1px solid var(--mui-palette-divider)",
                  bgcolor: "var(--mui-palette-background-paper)",
                }}
              >
                <Box
                  sx={{
                    height: 4,
                    width: "40%",
                    borderRadius: 0.5,
                    bgcolor: "var(--mui-palette-text-secondary)",
                    opacity: 0.3,
                    mb: 1,
                  }}
                />
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 0.5,
                  }}
                >
                  {["a1", "a2", "a3", "b1", "b2", "b3", "c1", "c2", "c3"].map(id => (
                    <Box
                      key={id}
                      sx={{
                        height: 16,
                        borderRadius: 0.5,
                        border: "1px solid var(--mui-palette-divider)",
                        bgcolor:
                          id === "b2"
                            ? "color-mix(in srgb, var(--mui-palette-secondary-main) 15%, transparent)"
                            : "transparent",
                      }}
                    />
                  ))}
                </Box>
              </Box>
            </Stack>
          </Box>
        </Box>

        <Stack spacing={2.5}>
          {appFeatures.map(feat => (
            <Stack key={feat} direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
              <CheckIcon sx={{ fontSize: 20, color: "var(--mui-palette-secondary-main)", flexShrink: 0, mt: 0.25 }} />
              <Typography variant="body1" sx={{ color: "var(--mui-palette-text-primary)", lineHeight: 1.6 }}>
                {feat}
              </Typography>
            </Stack>
          ))}
          <Stack direction="row" spacing={2} sx={{ pt: 1 }}>
            <Button
              href="#"
              variant="outlined"
              startIcon={<PhoneIphoneIcon />}
              sx={{
                borderColor: "var(--mui-palette-divider)",
                color: "var(--mui-palette-text-primary)",
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2,
                "&:hover": { borderColor: "var(--mui-palette-secondary-main)" },
              }}
            >
              {t.appCtaAppStore}
            </Button>
            <Button
              href="#"
              variant="outlined"
              startIcon={<PhoneAndroidIcon />}
              sx={{
                borderColor: "var(--mui-palette-divider)",
                color: "var(--mui-palette-text-primary)",
                textTransform: "none",
                fontWeight: 600,
                borderRadius: 2,
                "&:hover": { borderColor: "var(--mui-palette-secondary-main)" },
              }}
            >
              {t.appCtaPlayStore}
            </Button>
          </Stack>
        </Stack>
      </Box>
    </SectionWrapper>
  );
}

// ─── Final CTA ───────────────────────────────────────────────────────

function CtaSection(): ReactNode {
  const t = useAppTranslation(Landing);

  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(135deg, var(--mui-palette-primary-dark) 0%, var(--mui-palette-primary-main) 100%)",
        color: "var(--mui-palette-onPrimary)",
      }}
    >
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          opacity: 0.06,
          pointerEvents: "none",
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 36px, var(--mui-palette-secondary-light) 36px, var(--mui-palette-secondary-light) 38px)",
        }}
      />
      {/* Copper radial glow */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "-20%",
          insetInlineEnd: "-10%",
          width: "60%",
          height: "80%",
          background: "radial-gradient(circle, var(--mui-palette-secondary-main) 0%, transparent 60%)",
          opacity: 0.12,
          pointerEvents: "none",
        }}
      />
      {/* Floating geometric shapes */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "15%",
          insetInlineStart: "8%",
          width: 0,
          height: 0,
          borderLeft: "18px solid transparent",
          borderRight: "18px solid transparent",
          borderBottom: "30px solid var(--mui-palette-secondary-main)",
          opacity: 0.12,
          animation: "ctaFloat1 8s ease-in-out infinite",
          pointerEvents: "none",
          "@keyframes ctaFloat1": {
            "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
            "50%": { transform: "translateY(-16px) rotate(15deg)" },
          },
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          bottom: "20%",
          insetInlineEnd: "10%",
          width: 40,
          height: 40,
          bgcolor: "transparent",
          border: "2px solid var(--mui-palette-secondary-main)",
          opacity: 0.1,
          clipPath: "polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)",
          animation: "ctaFloat2 10s ease-in-out infinite",
          pointerEvents: "none",
          "@keyframes ctaFloat2": {
            "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
            "50%": { transform: "translateY(-12px) rotate(-20deg)" },
          },
        }}
      />
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          top: "60%",
          insetInlineStart: "15%",
          width: 0,
          height: 0,
          borderLeft: "12px solid transparent",
          borderRight: "12px solid transparent",
          borderBottom: "20px solid var(--mui-palette-secondary-light)",
          opacity: 0.08,
          animation: "ctaFloat3 12s ease-in-out infinite",
          pointerEvents: "none",
          "@keyframes ctaFloat3": {
            "0%, 100%": { transform: "translateY(0) rotate(0deg)" },
            "50%": { transform: "translateY(-10px) rotate(-10deg)" },
          },
        }}
      />

      <Container maxWidth="md" sx={{ position: "relative", zIndex: 1, py: { xs: 6, md: 10 } }}>
        <Stack spacing={3} sx={{ alignItems: "center", textAlign: "center" }}>
          <MosqueIcon sx={{ fontSize: 48, color: "var(--mui-palette-secondary-light)", opacity: 0.9 }} />
          <Typography
            variant="h2"
            sx={{
              fontSize: { xs: 28, md: 40 },
              fontWeight: 800,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              m: 0,
              background:
                "linear-gradient(120deg, var(--mui-palette-onPrimary) 30%, var(--mui-palette-secondary-light) 50%, var(--mui-palette-onPrimary) 70%)",
              backgroundSize: "200% auto",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
              animation: "textShine 4s linear infinite",
              "@keyframes textShine": {
                "0%": { backgroundPosition: "200% center" },
                "100%": { backgroundPosition: "-200% center" },
              },
            }}
          >
            {t.ctaTitle}
          </Typography>
          <Typography
            variant="h6"
            component="p"
            sx={{ maxWidth: 520, opacity: 0.85, fontWeight: 400, fontSize: { xs: 15, md: 17 } }}
          >
            {t.ctaSubtitle}
          </Typography>
          <Button
            component={Link}
            href="/register"
            variant="contained"
            size="large"
            sx={{
              mt: 1,
              position: "relative",
              overflow: "hidden",
              bgcolor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-onSecondary)",
              fontWeight: 700,
              textTransform: "none",
              fontSize: 17,
              borderRadius: 2,
              px: 5,
              py: 1.5,
              boxShadow: "0 8px 24px rgba(184,115,51,0.4)",
              "&::after": {
                content: '""',
                position: "absolute",
                top: 0,
                left: "-100%",
                width: "100%",
                height: "100%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                transition: "left 0.5s ease",
              },
              "&:hover": {
                bgcolor: "var(--mui-palette-secondary-dark)",
                transform: "translateY(-2px)",
                "&::after": { left: "100%" },
              },
              transition: "all 0.2s ease",
            }}
          >
            {t.ctaButton}
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}

// ─── Cookie consent (localStorage-backed external store) ────────────

const COOKIE_CONSENT_KEY = "kottaby-cookie-consent";
const COOKIE_ANALYTICS_KEY = "kottaby-cookie-analytics";
const COOKIE_MARKETING_KEY = "kottaby-cookie-marketing";

/**
 * Consent preferences live in localStorage, but React state must be
 * derived through `useSyncExternalStore` — never via synchronous
 * `setState` calls inside an effect. This module-scope subscriber is a
 * stable identity across renders; it listens both to our in-tab notify
 * channel and to cross-tab `storage` events.
 */
const consentListeners = new Set<() => void>();

function subscribeCookieConsent(listener: () => void): () => void {
  consentListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    consentListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function notifyConsentChanged(): void {
  for (const listener of consentListeners) listener();
}

/** True when no consent decision has been recorded yet. Server snapshot:
 * false so the banner stays hidden during SSR/hydration (no flash). */
function useNeedsConsentBanner(): boolean {
  return useSyncExternalStore(
    subscribeCookieConsent,
    () => localStorage.getItem(COOKIE_CONSENT_KEY) === null,
    () => false
  );
}

/** Stored boolean preference (`"false"` only disables); defaults to true.
 * Server snapshot matches the pre-hydration default to avoid drift. */
function useCookiePreference(key: string): boolean {
  return useSyncExternalStore(
    subscribeCookieConsent,
    () => localStorage.getItem(key) !== "false",
    () => true
  );
}

function CookieConsent(): ReactNode {
  const t = useAppTranslation(Landing);
  const [cookieDialogOpen, setCookieDialogOpen] = useState(false);

  const needsConsent = useNeedsConsentBanner();
  const analyticsPref = useCookiePreference(COOKIE_ANALYTICS_KEY);
  const marketingPref = useCookiePreference(COOKIE_MARKETING_KEY);

  // Dialog-local drafts: edits stay transient until the visitor saves.
  const [draftAnalytics, setDraftAnalytics] = useState(true);
  const [draftMarketing, setDraftMarketing] = useState(true);

  const openSettings = useCallback(() => {
    setDraftAnalytics(analyticsPref);
    setDraftMarketing(marketingPref);
    setCookieDialogOpen(true);
  }, [analyticsPref, marketingPref]);

  const handleAccept = useCallback(() => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    localStorage.setItem(COOKIE_ANALYTICS_KEY, "true");
    localStorage.setItem(COOKIE_MARKETING_KEY, "true");
    notifyConsentChanged();
  }, []);

  const handleDecline = useCallback(() => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "declined");
    localStorage.setItem(COOKIE_ANALYTICS_KEY, "false");
    localStorage.setItem(COOKIE_MARKETING_KEY, "false");
    notifyConsentChanged();
  }, []);

  const handleSaveCookieSettings = useCallback(() => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "custom");
    localStorage.setItem(COOKIE_ANALYTICS_KEY, String(draftAnalytics));
    localStorage.setItem(COOKIE_MARKETING_KEY, String(draftMarketing));
    notifyConsentChanged();
    setCookieDialogOpen(false);
  }, [draftAnalytics, draftMarketing]);

  if (!needsConsent) return null;

  return (
    <>
      <Box
        sx={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 150,
          borderTop: "2px solid var(--mui-palette-secondary-main)",
          backdropFilter: "blur(16px)",
          bgcolor: "color-mix(in srgb, var(--mui-palette-background-paper) 80%, transparent)",
        }}
      >
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            sx={{
              alignItems: { xs: "flex-start", sm: "center" },
              justifyContent: "space-between",
              py: 2.5,
              gap: 2,
            }}
          >
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="subtitle2"
                sx={{ fontWeight: 700, mb: 0.5, color: "var(--mui-palette-text-primary)" }}
              >
                {t.cookieTitle}
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: "var(--mui-palette-text-secondary)", lineHeight: 1.5, fontSize: 13 }}
              >
                {t.cookieBody}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0 }}>
              <Button
                onClick={handleDecline}
                sx={{
                  color: "var(--mui-palette-text-secondary)",
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2,
                  minHeight: 44,
                  px: 2,
                  "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-text-secondary) 8%, transparent)" },
                }}
              >
                {t.cookieDecline}
              </Button>
              <Button
                onClick={openSettings}
                sx={{
                  color: "var(--mui-palette-secondary-main)",
                  textTransform: "none",
                  fontWeight: 600,
                  borderRadius: 2,
                  minHeight: 44,
                  px: 2,
                  "&:hover": { bgcolor: "color-mix(in srgb, var(--mui-palette-secondary-main) 8%, transparent)" },
                }}
              >
                {t.cookieSettings}
              </Button>
              <Button
                onClick={handleAccept}
                variant="contained"
                sx={{
                  position: "relative",
                  overflow: "hidden",
                  bgcolor: "var(--mui-palette-secondary-main)",
                  color: "var(--mui-palette-onSecondary)",
                  textTransform: "none",
                  fontWeight: 700,
                  borderRadius: 2,
                  minHeight: 44,
                  px: 2,
                  "&::after": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: "-100%",
                    width: "100%",
                    height: "100%",
                    background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                    transition: "left 0.5s ease",
                  },
                  "&:hover": {
                    bgcolor: "var(--mui-palette-secondary-dark)",
                    "&::after": { left: "100%" },
                  },
                }}
              >
                {t.cookieAccept}
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Cookie Settings Dialog */}
      <Dialog
        open={cookieDialogOpen}
        onClose={() => setCookieDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        slotProps={{
          paper: {
            sx: {
              bgcolor: "var(--mui-palette-background-paper)",
              borderRadius: 3,
              border: "1px solid var(--mui-palette-divider)",
            },
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>{t.cookieDialogTitle}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: "var(--mui-palette-text-secondary)", mb: 3, lineHeight: 1.6 }}>
            {t.cookieDialogBody}
          </Typography>
          <Stack spacing={2.5}>
            <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
              <FormControlLabel control={<Switch checked disabled />} label={t.cookieDialogNecessary} sx={{ m: 0 }} />
            </Stack>
            <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", mt: -1.5, pl: 6 }}>
              {t.cookieDialogNecessaryDesc}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
              <FormControlLabel
                control={<Switch checked={draftAnalytics} onChange={e => setDraftAnalytics(e.target.checked)} />}
                label={t.cookieDialogAnalytics}
                sx={{ m: 0 }}
              />
            </Stack>
            <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", mt: -1.5, pl: 6 }}>
              {t.cookieDialogAnalyticsDesc}
            </Typography>
            <Stack direction="row" spacing={2} sx={{ alignItems: "flex-start" }}>
              <FormControlLabel
                control={<Switch checked={draftMarketing} onChange={e => setDraftMarketing(e.target.checked)} />}
                label={t.cookieDialogMarketing}
                sx={{ m: 0 }}
              />
            </Stack>
            <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", mt: -1.5, pl: 6 }}>
              {t.cookieDialogMarketingDesc}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button
            onClick={handleSaveCookieSettings}
            variant="contained"
            sx={{
              position: "relative",
              overflow: "hidden",
              bgcolor: "var(--mui-palette-secondary-main)",
              color: "var(--mui-palette-onSecondary)",
              fontWeight: 700,
              textTransform: "none",
              borderRadius: 2,
              "&::after": {
                content: '""',
                position: "absolute",
                top: 0,
                left: "-100%",
                width: "100%",
                height: "100%",
                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)",
                transition: "left 0.5s ease",
              },
              "&:hover": {
                bgcolor: "var(--mui-palette-secondary-dark)",
                "&::after": { left: "100%" },
              },
            }}
          >
            {t.cookieDialogSave}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

// ─── Shared section wrapper ──────────────────────────────────────────

function SectionWrapper({
  badge,
  title,
  subtitle,
  bg,
  children,
}: Readonly<{
  badge: string;
  title: string;
  subtitle: string;
  bg: "default" | "paper";
  children: ReactNode;
}>): ReactNode {
  return (
    <Box
      component="section"
      sx={{
        position: "relative",
        overflow: "hidden",
        bgcolor: `var(--mui-palette-background-${bg})`,
        py: { xs: 6, md: 10 },
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={1.5} sx={{ mb: 5, maxWidth: 640 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Box aria-hidden sx={{ width: 24, height: 2, bgcolor: "var(--mui-palette-secondary-main)" }} />
            <Typography
              variant="overline"
              sx={{
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "var(--mui-palette-secondary-main)",
                lineHeight: 1,
              }}
            >
              {badge}
            </Typography>
          </Stack>
          {/* Decorative diamond */}
          <Box
            aria-hidden
            sx={{
              width: 6,
              height: 6,
              bgcolor: "var(--mui-palette-secondary-main)",
              transform: "rotate(45deg)",
              mx: "auto",
              my: 0.5,
            }}
          />
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              fontSize: { xs: 26, md: 34 },
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              m: 0,
              background:
                "linear-gradient(135deg, var(--mui-palette-text-primary) 40%, var(--mui-palette-secondary-main) 100%)",
              backgroundClip: "text",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            {title}
          </Typography>
          <Typography
            variant="body1"
            sx={{ color: "var(--mui-palette-text-secondary)", lineHeight: 1.6, fontSize: 16 }}
          >
            {subtitle}
          </Typography>
        </Stack>
        {children}
      </Container>
    </Box>
  );
}

// ─── Teacher Spotlight section ───────────────────────────────────
function TeacherSpotlightSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const teachers = [
    {
      name: t.teacher1Name,
      specialty: t.teacher1Specialty,
      location: t.teacher1Location,
      sessions: 1240,
      rating: 4.9,
      initial: "A",
    },
    {
      name: t.teacher2Name,
      specialty: t.teacher2Specialty,
      location: t.teacher2Location,
      sessions: 870,
      rating: 4.8,
      initial: "M",
    },
    {
      name: t.teacher3Name,
      specialty: t.teacher3Specialty,
      location: t.teacher3Location,
      sessions: 650,
      rating: 5.0,
      initial: "I",
    },
    {
      name: t.teacher4Name,
      specialty: t.teacher4Specialty,
      location: t.teacher4Location,
      sessions: 2100,
      rating: 4.9,
      initial: "H",
    },
  ];
  return (
    <SectionWrapper badge={t.teachersBadge} title={t.teachersTitle} subtitle={t.teachersSubtitle} bg="paper">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1fr 1fr 1fr 1fr" }, gap: 3 }}>
        {teachers.map((teacher, idx) => (
          <Stack
            key={teacher.name}
            spacing={2}
            sx={{
              p: 3,
              borderRadius: 3,
              bgcolor: "var(--mui-palette-background-default)",
              border: "1px solid var(--mui-palette-divider)",
              height: "100%",
              position: "relative",
              overflow: "hidden",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease",
              "&:hover": {
                borderColor: "var(--mui-palette-secondary-main)",
                boxShadow: "0 12px 32px rgba(184,115,51,0.12)",
                transform: "translateY(-4px)",
                "&::before": { opacity: 1 },
              },
              "&:active": { transform: "translateY(-2px) scale(0.98)" },
              "&::before": {
                content: '""',
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: "40%",
                background:
                  "linear-gradient(to bottom, color-mix(in srgb, var(--mui-palette-secondary-main) 0.06), transparent)",
                opacity: 0,
                transition: "opacity 0.3s ease",
                pointerEvents: "none",
              },
              animation: `staggerFadeIn 0.5s ease ${idx * 0.1}s both`,
              "@keyframes staggerFadeIn": {
                "0%": { opacity: 0, transform: "translateY(16px)" },
                "100%": { opacity: 1, transform: "translateY(0)" },
              },
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, var(--mui-palette-secondary-main), var(--mui-palette-secondary-dark))",
                color: "var(--mui-palette-onSecondary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                fontWeight: 800,
                boxShadow: "0 4px 12px rgba(184,115,51,0.3)",
                position: "relative",
                zIndex: 1,
              }}
            >
              {teacher.initial}
            </Box>
            <Box sx={{ position: "relative", zIndex: 1, flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 16, lineHeight: 1.3 }}>{teacher.name}</Typography>
              <Typography
                variant="caption"
                sx={{
                  color: "var(--mui-palette-secondary-main)",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 0.5,
                  mt: 0.25,
                }}
              >
                <MosqueIcon sx={{ fontSize: 14 }} />
                {teacher.specialty}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", mt: 0.5 }}>
                <LocationIcon sx={{ fontSize: 14, color: "var(--mui-palette-text-secondary)" }} />
                <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)" }}>
                  {teacher.location}
                </Typography>
              </Stack>
            </Box>
            <Stack
              direction="row"
              spacing={2}
              sx={{ position: "relative", zIndex: 1, pt: 1, borderTop: "1px solid var(--mui-palette-divider)" }}
            >
              <Stack spacing={0} sx={{ alignItems: "center", flex: 1 }}>
                <Typography
                  sx={{ fontWeight: 800, fontSize: 16, color: "var(--mui-palette-secondary-main)", lineHeight: 1 }}
                >
                  {teacher.sessions.toLocaleString()}
                </Typography>
                <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", fontSize: 11 }}>
                  {t.teacherSessionsCount}
                </Typography>
              </Stack>
              <Stack spacing={0} sx={{ alignItems: "center", flex: 1 }}>
                <Stack direction="row" spacing={0.25} sx={{ alignItems: "center" }}>
                  <Star sx={{ fontSize: 14, color: "var(--mui-palette-secondary-main)" }} />
                  <Typography
                    sx={{ fontWeight: 800, fontSize: 16, color: "var(--mui-palette-secondary-main)", lineHeight: 1 }}
                  >
                    {teacher.rating}
                  </Typography>
                </Stack>
                <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", fontSize: 11 }}>
                  {t.teacherRating}
                </Typography>
              </Stack>
            </Stack>
            <Button
              component={Link}
              href="/register"
              variant="outlined"
              fullWidth
              sx={{
                position: "relative",
                zIndex: 1,
                mt: "auto",
                minHeight: 44,
                py: 1.5,
                borderColor: "var(--mui-palette-secondary-main)",
                color: "var(--mui-palette-secondary-main)",
                fontWeight: 700,
                textTransform: "none",
                borderRadius: 2,
                transition: "all 0.2s ease",
                "&:hover": {
                  bgcolor: "var(--mui-palette-secondary-main)",
                  color: "var(--mui-palette-onSecondary)",
                  borderColor: "var(--mui-palette-secondary-main)",
                },
              }}
            >
              {t.teacherBookSession}
            </Button>
          </Stack>
        ))}
      </Box>
    </SectionWrapper>
  );
}

// ─── Resources section ───────────────────────────────────────────
function ResourcesSection(): ReactNode {
  const t = useAppTranslation(Landing);
  const resources = [
    { title: t.resource1Title, category: t.resource1Category, date: t.resource1Date, excerpt: t.resource1Excerpt },
    { title: t.resource2Title, category: t.resource2Category, date: t.resource2Date, excerpt: t.resource2Excerpt },
    { title: t.resource3Title, category: t.resource3Category, date: t.resource3Date, excerpt: t.resource3Excerpt },
  ];
  return (
    <SectionWrapper badge={t.resourcesBadge} title={t.resourcesTitle} subtitle={t.resourcesSubtitle} bg="default">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1fr" }, gap: 3 }}>
        {resources.map((r, idx) => (
          <Stack
            key={r.title}
            spacing={2}
            sx={{
              p: 3,
              borderRadius: 3,
              bgcolor: "var(--mui-palette-background-paper)",
              border: "1px solid var(--mui-palette-divider)",
              height: "100%",
              position: "relative",
              overflow: "hidden",
              transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease",
              "&:hover": {
                borderColor: "var(--mui-palette-secondary-main)",
                boxShadow: "0 12px 32px rgba(184,115,51,0.1)",
                transform: "translateY(-4px)",
              },
              "&:active": { transform: "translateY(-2px) scale(0.98)" },
              animation: `staggerFadeIn 0.5s ease ${idx * 0.12}s both`,
              "@keyframes staggerFadeIn": {
                "0%": { opacity: 0, transform: "translateY(16px)" },
                "100%": { opacity: 1, transform: "translateY(0)" },
              },
            }}
          >
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Chip
                label={r.category}
                size="small"
                sx={{
                  bgcolor: "var(--mui-palette-secondary-main)",
                  color: "var(--mui-palette-onSecondary)",
                  fontWeight: 700,
                  fontSize: 11,
                  letterSpacing: "0.02em",
                  height: 24,
                  opacity: 0.12,
                }}
              />
              <Typography variant="caption" sx={{ color: "var(--mui-palette-text-secondary)", fontSize: 11 }}>
                {r.date}
              </Typography>
            </Stack>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                fontSize: 17,
                lineHeight: 1.3,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {r.title}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: "var(--mui-palette-text-secondary)",
                lineHeight: 1.6,
                flex: 1,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {r.excerpt}
            </Typography>
            <Box
              aria-hidden
              sx={{ width: 32, height: 2, bgcolor: "var(--mui-palette-secondary-main)", borderRadius: 1, opacity: 0.4 }}
            />
            <Typography
              component="button"
              onClick={() => {}}
              sx={{
                color: "var(--mui-palette-secondary-main)",
                fontWeight: 700,
                fontSize: 14,
                textTransform: "none",
                p: 0,
                minHeight: 44,
                minWidth: 44,
                display: "inline-flex",
                alignItems: "center",
                background: "none",
                border: "none",
                cursor: "pointer",
                "&:hover": { textDecoration: "underline" },
                "&:focus-visible": {
                  outline: "2px solid var(--mui-palette-secondary-main)",
                  outlineOffset: 2,
                  borderRadius: 1,
                },
              }}
            >
              {t.resourceReadMore}
            </Typography>
          </Stack>
        ))}
      </Box>
    </SectionWrapper>
  );
}

// ─── WhatsApp floating button ─────────────────────────────────────
function WhatsAppButton(): ReactNode {
  const t = useAppTranslation(Landing);
  const [hovered, setHovered] = useState(false);
  return (
    <Tooltip title={t.whatsappTooltip} placement="left" arrow>
      <span>
        <Box
          component="a"
          href="https://wa.me/1234567890"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.whatsappA11y}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          sx={{
            position: "fixed",
            bottom: 80,
            insetInlineEnd: 24,
            width: 56,
            height: 56,
            borderRadius: "50%",
            bgcolor: "var(--mui-palette-success-main)",
            color: "var(--mui-palette-onSuccess)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            boxShadow: hovered ? "0 8px 24px rgba(37,211,102,0.45)" : "0 4px 14px rgba(37,211,102,0.35)",
            transform: hovered ? "scale(1.1)" : "scale(1)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
        >
          <svg width={28} height={28} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </Box>
      </span>
    </Tooltip>
  );
}

// ─── Brand mark (inline SVG — open book + crescent, copper) ─────────

function BrandMark({ size = 40 }: { readonly size?: number }): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden style={{ flexShrink: 0 }}>
      <circle cx="24" cy="24" r="22" stroke="var(--mui-palette-secondary-light)" strokeWidth="1.5" opacity="0.55" />
      <path
        d="M12 16c4-2 8-2 12 0 4-2 8-2 12 0v18c-4-2-8-2-12 0-4-2-8-2-12 0V16z"
        fill="var(--mui-palette-secondary-light)"
        opacity="0.95"
      />
      <path d="M24 16v18" stroke="var(--mui-palette-primary-dark)" strokeWidth="1.5" />
      <path d="M34 12a4 4 0 1 1-3.5 6 3 3 0 1 0 3.5-6z" fill="var(--mui-palette-onPrimary)" opacity="0.9" />
    </svg>
  );
}
