"use client";

import { MenuBookOutlined, RadioButtonCheckedOutlined, RadioButtonUncheckedOutlined } from "@mui/icons-material";
import { Box, Card, CardContent, Chip, CircularProgress, Stack, Typography, useTheme } from "@mui/material";
import type { RecitationReading } from "@/frontend/graphql/generated/gql/graphql";
import { getRecitationDescription, getRecitationLabel } from "@/frontend/lib/recitation-labels";
import type { RecitationLabels } from "@/shared/locale/types/recitation";

/**
 * RecitationSelector — premium card-based Qira'ah selector.
 *
 * Replaces the basic MUI Select dropdown with a responsive grid of selectable
 * cards. Each card shows the reading name (translated), a short description
 * (region/context), and a radio indicator. The first reading (Hafs `an Asim)
 * gets a "Most popular" badge.
 *
 * Design (MUI v9 + theme palette):
 *  - Card grid: 2 columns on desktop, 1 on mobile.
 *  - Selected card: primary-color border + primaryContainer background.
 *  - Hover: subtle elevation + border tint.
 *  - Radio icon: RadioChecked (primary) / RadioButtonUnchecked (muted).
 *  - MenuBookOutlined icon on each card header.
 *  - "Most popular" chip on Hafs (secondary color).
 *  - Loading state: centered CircularProgress.
 *  - All colors from `theme.palette.*` — no hardcoded hex.
 *
 * All labels come from `useAppTranslation(Recitation)`; MUI v9 `sx` only,
 * `*Outlined` icons.
 */
export interface RecitationSelectorProps {
  /** Currently selected reading (or "" for none). */
  readonly value: RecitationReading | "";
  /** Called when the user selects a reading. */
  readonly onChange: (value: RecitationReading) => void;
  /** Translated labels for the recitation namespace. */
  readonly labels: RecitationLabels;
  /** Available readings from the GraphQL catalog query. */
  readonly options: ReadonlyArray<RecitationReading>;
  /** Whether the catalog query is loading. */
  readonly loading: boolean;
}

export function RecitationSelector({ value, onChange, labels, options, loading }: RecitationSelectorProps) {
  const theme = useTheme();

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <Box
      aria-label={labels.selectTitle}
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
        gap: 1.5,
        maxHeight: 360,
        overflowY: "auto",
        pr: 1,
        // Custom scrollbar for the grid
        "&::-webkit-scrollbar": { width: 6 },
        "&::-webkit-scrollbar-thumb": {
          backgroundColor: theme.palette.divider,
          borderRadius: 3,
        },
        "&::-webkit-scrollbar-track": { background: "transparent" },
      }}
    >
      {options.map((reading, index) => {
        const isSelected = value === reading;
        const isPopular = index === 0; // Hafs `an Asim is first in the catalog
        const label = getRecitationLabel(reading, labels);
        const description = getRecitationDescription(reading, labels);

        return (
          <Card
            key={reading}
            // These cards were pointer-only (`<div onClick>`) — a
            // complete keyboard lockout (WCAG 2.1.1) and role/name-less to
            // assistive tech. Native <button> gives focus + Enter/Space, and
            // `aria-pressed` publishes the selected state to AT (the
            // single-choice constraint stays a form-level invariant).
            component="button"
            type="button"
            aria-pressed={isSelected}
            onClick={() => onChange(reading)}
            sx={{
              display: "block",
              width: "100%",
              p: 0,
              textAlign: "start",
              font: "inherit",
              color: "inherit",
              cursor: "pointer",
              border: 1.5,
              borderColor: isSelected ? "var(--mui-palette-primary-main)" : "var(--mui-palette-outlineVariant)",
              bgcolor: isSelected ? "var(--mui-palette-primaryContainer)" : "var(--mui-palette-background-paper)",
              borderRadius: 2,
              "&:focus-visible": {
                outline: "2px solid",
                outlineColor: "var(--mui-palette-primary-main)",
                outlineOffset: 2,
              },
              // Subtle copper left-accent on selected cards — emphasizes the
              // brand identity (midnight blue selected surface + copper stripe).
              boxShadow: isSelected ? `inset 3px 0 0 ${theme.palette.secondary.main}` : theme.shadows[0],
              transition: theme.transitions.create(["border-color", "box-shadow", "background-color"], {
                duration: theme.transitions.duration.short,
              }),
              "&:hover": {
                borderColor: isSelected ? "var(--mui-palette-primary-main)" : "var(--mui-palette-primary-light)",
                boxShadow: isSelected
                  ? `inset 3px 0 0 ${theme.palette.secondary.main}, ${theme.shadows[2]}`
                  : theme.shadows[3],
              },
              position: "relative",
              overflow: "visible",
            }}
            elevation={0}
          >
            <CardContent sx={{ p: 1.75, "&:last-child": { pb: 1.75 } }}>
              <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
                {/* Radio indicator */}
                <Box
                  sx={{
                    mt: 0.25,
                    color: isSelected ? "var(--mui-palette-primary-main)" : "var(--mui-palette-text-disabled)",
                  }}
                >
                  {isSelected ? (
                    <RadioButtonCheckedOutlined fontSize="small" />
                  ) : (
                    <RadioButtonUncheckedOutlined fontSize="small" />
                  )}
                </Box>

                {/* Content */}
                <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <MenuBookOutlined
                      sx={{
                        fontSize: 18,
                        color: isSelected ? "var(--mui-palette-secondary-main)" : "var(--mui-palette-text-secondary)",
                        flexShrink: 0,
                      }}
                    />
                    <Typography
                      variant="body2"
                      sx={{
                        fontWeight: 600,
                        color: isSelected ? "var(--mui-palette-onPrimaryContainer)" : "var(--mui-palette-text-primary)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </Typography>
                    {isPopular ? (
                      <Chip
                        component="span"
                        label={labels.mostPopular}
                        size="small"
                        sx={{
                          height: 20,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          bgcolor: "var(--mui-palette-secondaryContainer)",
                          color: "var(--mui-palette-onSecondaryContainer)",
                          border: 1,
                          borderColor: "var(--mui-palette-secondary-main)",
                          flexShrink: 0,
                        }}
                      />
                    ) : null}
                  </Stack>
                  {description ? (
                    <Typography
                      variant="caption"
                      sx={{
                        color: isSelected
                          ? "var(--mui-palette-onPrimaryContainer)"
                          : "var(--mui-palette-text-secondary)",
                        opacity: 0.85,
                        lineHeight: 1.3,
                      }}
                    >
                      {description}
                    </Typography>
                  ) : null}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        );
      })}
    </Box>
  );
}
