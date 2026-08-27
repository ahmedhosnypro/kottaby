"use client";

import { HourglassEmptyOutlined as HourglassIcon } from "@mui/icons-material";
import { Box, Card, CardContent, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Dashboard, useAppTranslation } from "@/shared/locale";
import type { DashboardLabels } from "@/shared/locale/types/dashboard";

/**
 * Maps a URL `feature` segment (the `[feature]` dynamic param) to its
 * translated display name, looked up from `DashboardLabels`.
 *
 * Unknown feature segments fall back to the raw segment string (title-cased)
 * so the Coming Soon view always has something to show — even if a new nav
 * item was added without updating this map.
 */
function resolveFeatureLabel(feature: string, t: DashboardLabels): string {
  // The map keys mirror the routes defined in `navItems.ts` (without the
  // leading slash). Using a Record keeps the lookup exhaustive + typed.
  const featureMap: Record<string, string> = {
    sessions: t.sessions,
    subscriptions: t.subscriptions,
    homework: t.homework,
    schedule: t.schedule,
    wallet: t.wallet,
    users: t.users,
    teachers: t.teachers,
    students: t.students,
    plans: t.plans,
    audit: t.audit,
    children: t.children,
  };
  return featureMap[feature] ?? feature;
}

interface ComingSoonViewProps {
  /** The URL feature segment (e.g. "sessions", "wallet"). */
  readonly feature: string;
}

/**
 * ComingSoonView — placeholder view shown for dashboard routes whose real
 * page hasn't been built yet (FR-2, FR-3, FR-5, FR-6, FR-9, FR-10
 * subsystems).
 *
 * Rendered by `app/(dashboard)/[feature]/page.tsx` for any single-segment
 * route under `(dashboard)` that doesn't have a dedicated `page.tsx`. Real
 * routes (`/dashboard`, `/profile`) take precedence over the catch-all.
 *
 * MUI v9 patterns: `sx` callback only, `*Outlined` icons, theme palette
 * colors.
 */
export function ComingSoonView({ feature }: Readonly<ComingSoonViewProps>): ReactNode {
  const t = useAppTranslation(Dashboard);
  const featureLabel = resolveFeatureLabel(feature, t);

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
      }}
    >
      <Card
        elevation={0}
        sx={theme => ({
          maxWidth: 560,
          width: "100%",
          borderRadius: 3,
          border: "1px solid",
          borderColor: theme.palette.outlineVariant,
          bgcolor: theme.palette.surfaceContainerLow,
        })}
      >
        <CardContent sx={{ p: { xs: 3, sm: 5 }, textAlign: "center" }}>
          <Box
            sx={theme => ({
              width: 72,
              height: 72,
              mx: "auto",
              mb: 3,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: theme.palette.secondaryContainer,
              color: theme.palette.onSecondaryContainer,
            })}
          >
            <HourglassIcon sx={{ fontSize: 36 }} />
          </Box>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700, mb: 1 }}>
            {t.comingSoon}
          </Typography>
          <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary, lineHeight: 1.6 })}>
            {t.comingSoonBody(featureLabel)}
          </Typography>
          <Stack
            direction="row"
            spacing={1}
            sx={{
              alignItems: "center",
              justifyContent: "center",
              mt: 3,
            }}
          >
            <Typography
              variant="overline"
              sx={theme => ({
                color: theme.palette.text.secondary,
                letterSpacing: "0.12em",
                fontWeight: 600,
              })}
            >
              {featureLabel}
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
