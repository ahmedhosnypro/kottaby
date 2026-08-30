"use client";

import { DoneOutlined, NotificationsOutlined } from "@mui/icons-material";
import { Box, Button, Chip, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
// audit-R4: shared keyboard-focus ring (v9 ButtonBase ships none).
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import type { MyNotificationsQuery_myNotifications_items } from "@/frontend/graphql/generated/gql/graphql";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import {
  NOTIFICATION_TYPE_ICONS,
  NOTIFICATION_TYPE_LABEL_ACCESSORS,
} from "@/frontend/views/notifications/notification-type-presentation";
import { darkOutlinedContrastSx } from "@/frontend/views/notifications/outlined-button-contrast";
import type { NotificationsLabels } from "@/shared/locale/types/notifications";

/**
 * Visually-hidden text styles — the standard clip-into-1px recipe (no
 * dedicated a11y utility is a direct dependency), so the unread dot can
 * expose its state as REAL text content for screen readers instead of an
 * ARIA name on a name-prohibited generic element (the oxlint
 * `prefer-tag-over-role` rule rejects `role="img"` shims here).
 *
 * The length values are px STRING literals (not bare numbers): MUI's sx
 * transforms reinterpret numeric literals as spacing/theme tokens — `width: 1`
 * becomes `100%`, `margin: -1` becomes `-8px` — which would blow the clipped
 * box up to viewport size and leak blank scrollable space below the feed.
 * The px strings match the canonical `@mui/utils/visuallyHidden` recipe.
 */
const VISUALLY_HIDDEN_TEXT_SX = {
  position: "absolute",
  width: "1px",
  height: "1px",
  padding: 0,
  margin: "-1px",
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

interface NotificationRowProps {
  /** One normalized `Notification` row (all eight public fields). */
  readonly notification: MyNotificationsQuery_myNotifications_items;
  /** `notifications` namespace labels (property access only). */
  readonly labels: NotificationsLabels;
  /** Active app locale (drives the locale-aware timestamp stamp). */
  readonly locale: string;
  /** Mark-one handler — receives the notification id (STRING wire form). */
  readonly onMarkRead: (id: string) => void;
  /** Whether THIS row's mark-read mutation is in flight. */
  readonly markReadPending?: boolean;
}

/**
 * NotificationRow — one inbox row (REQ-063b): leading type icon → content
 * (title / body / type chip + timestamp) → mark-read action. The DOM order
 * icon→content→action mirrors visually under RTL (plain flex rows reverse
 * with `dir="rtl"` — no physical margins anywhere).
 *
 * Content renders as TEXT nodes through MUI `Typography` ONLY (REQ-028 —
 * emitter copy is untrusted; raw-HTML rendering is prohibited across
 * `frontend/views/notifications/**` and statically scanned).
 *
 * Unread posture (plan §5.5 visual matrix): the row tints through the
 * `theme.palette.action.selected` token (read rows keep the default
 * transparent element background — no explicit fallback branch), a dot chip
 * whose visually-hidden text content (`filterUnread`) flags the unread
 * state to assistive tech, the title carries the bold weight, and the
 * mark-read action is offered; read rows render un-tinted with no dot and
 * no action.
 *
 * Touch posture: `sm+` shows the inline secondary button; on `xs` the action
 * is a ≥44px icon-only button with the translated row-context `aria-label`
 * (`markReadAriaLabel`) — a single-action row keeps a direct affordance
 * rather than an overflow menu. Both affordances carry a row-context
 * `Tooltip` (the NotificationUnreadBadge / LocaleSwitcher precedent) so
 * pointer users get the same target-of-action context screen readers
 * announce, and the inline button paints through the dark-mode outlined
 * contrast lift (`darkOutlinedContrastSx`) so its label clears AA in both
 * color schemes.
 */
export function NotificationRow({
  notification,
  labels,
  locale,
  onMarkRead,
  markReadPending = false,
}: Readonly<NotificationRowProps>): ReactNode {
  // Schema-drift guard: a newer server enum member can reach an older
  // client (the generated enum misses the runtime value) — fall back to a
  // neutral icon instead of rendering an undefined component type.
  const TypeIcon = NOTIFICATION_TYPE_ICONS[notification.type] ?? NotificationsOutlined;
  const typeLabelAccessor = NOTIFICATION_TYPE_LABEL_ACCESSORS[notification.type] ?? (() => notification.title);
  const unread = !notification.isRead;
  const markReadLabel = labels.markReadAriaLabel(notification.title);

  const handleMarkRead = (): void => {
    onMarkRead(notification.id);
  };

  return (
    <Box
      component="li"
      sx={theme => ({
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        gap: { xs: 1.5, sm: 2 },
        p: { xs: 1.5, sm: 2 },
        borderRadius: 2,
        bgcolor: unread ? theme.palette.action.selected : undefined,
      })}
    >
      <Box
        aria-hidden
        sx={theme => ({
          flexShrink: 0,
          width: 40,
          height: 40,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          bgcolor: theme.palette.primaryContainer,
          color: theme.palette.onPrimaryContainer,
        })}
      >
        <TypeIcon fontSize="small" />
      </Box>
      <Stack spacing={0.5} sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
          {unread ? (
            <Box
              sx={theme => ({
                flexShrink: 0,
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: theme.palette.primary.main,
              })}
            >
              <Box component="span" sx={VISUALLY_HIDDEN_TEXT_SX}>
                {labels.filterUnread}
              </Box>
            </Box>
          ) : null}
          <Typography
            variant="subtitle1"
            component="h2"
            noWrap
            sx={theme => ({
              fontWeight: unread ? 700 : 500,
              color: theme.palette.text.primary,
              minWidth: 0,
            })}
          >
            {notification.title}
          </Typography>
        </Stack>
        {notification.body !== null ? (
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, lineHeight: 1.5 })}>
            {notification.body}
          </Typography>
        ) : null}
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", marginTop: 0.5 }}>
          <Chip
            icon={<TypeIcon fontSize="small" />}
            label={typeLabelAccessor(labels)}
            size="small"
            variant="outlined"
            sx={theme => ({ minHeight: 28, color: theme.palette.text.secondary })}
          />
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
            <time dateTime={notification.createdAt}>{formatApplicantDate(notification.createdAt, locale)}</time>
          </Typography>
        </Stack>
      </Stack>
      {unread ? (
        <Stack direction="row" spacing={1} sx={{ flexShrink: 0, alignItems: "center" }}>
          <Tooltip title={markReadLabel}>
            <Button
              size="small"
              variant="outlined"
              startIcon={<DoneOutlined />}
              disabled={markReadPending}
              aria-label={markReadLabel}
              onClick={handleMarkRead}
              // QA round 2 (axe serious): dark-mode outlined text/border lift.
              sx={theme => ({
                ...focusVisibleRingSx,
                ...darkOutlinedContrastSx(theme),
                display: { xs: "none", sm: "inline-flex" },
                flexShrink: 0,
              })}
            >
              {labels.markRead}
            </Button>
          </Tooltip>
          <Tooltip title={markReadLabel}>
            <IconButton
              size="small"
              aria-label={markReadLabel}
              disabled={markReadPending}
              onClick={handleMarkRead}
              sx={{
                ...focusVisibleRingSx,
                display: { xs: "inline-flex", sm: "none" },
                minHeight: 44,
                minWidth: 44,
              }}
            >
              <DoneOutlined fontSize="small" />
            </IconButton>
          </Tooltip>
        </Stack>
      ) : null}
    </Box>
  );
}
