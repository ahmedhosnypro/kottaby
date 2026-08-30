"use client";

import { useQuery } from "@apollo/client/react";
import { Box, Button, Divider, List, ListItemButton, Popover, Skeleton, Stack, Typography } from "@mui/material";
import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
// audit-R4: shared keyboard-focus ring (v9 ButtonBase ships none).
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import type {
  MyNotificationsFilterInput,
  MyNotificationsQuery_myNotifications_items,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  myNotificationsQueryDocument,
  myUnreadNotificationCountQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { useNotificationMarkActions } from "@/frontend/hooks/use-notification-mark-actions";
import { formatApplicantDate } from "@/frontend/lib/i18n/format-date";
import { logger } from "@/frontend/lib/logger";
import { Common, Notifications, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * Drawer window size — the latest few notifications (prototype contract: a
 * glanceable preview, the `/notifications` page owns the full inbox).
 */
const DRAWER_PAGE_SIZE = 5;

/**
 * Stable identities for the skeleton rows — decorative placeholders that
 * never reorder; module-level keys keep React keys OFF the bare array index
 * (biome `noArrayIndexKey`), the `NotificationSkeletonList` precedent.
 */
const SKELETON_ROW_KEYS: readonly string[] = ["drawer-skeleton-1", "drawer-skeleton-2", "drawer-skeleton-3"];

/** Stable identity for the "no rows pending" initial state. */
const NO_PENDING_IDS: readonly string[] = [];

/** Removes one id from the pending mark-read set (state-updater helper). */
function withoutPendingId(ids: readonly string[], id: string): readonly string[] {
  return ids.filter(pendingId => pendingId !== id);
}

interface NotificationDrawerProps {
  /** Bell button element the popover anchors to (null while closed). */
  readonly anchorEl: HTMLElement | null;
  /** Whether the drawer is open. */
  readonly open: boolean;
  /** Close callback (Escape, click-away, row navigation, footer link). */
  readonly onClose: () => void;
}

/**
 * NotificationDrawer — the floating bell popover (drawer-plan DR-1..DR-8):
 * the latest notifications preview anchored beneath the app-bar bell, with a
 * pinned header (title + mark-all) and a pinned footer linking to the full
 * `/notifications` page (which also stays reachable from the sidebar).
 *
 * Row anatomy follows the prototype: unread dot + bold title + end-aligned
 * locale-formatted timestamp + 2-line-clamped body. Row click marks the row
 * read (when unread) and navigates to the full page. No per-row actions, no
 * avatars, no type chips — the feed page owns that richer anatomy.
 *
 * Data posture: the Apollo cache is the single truth (plan D11). The list
 * query is skipped while closed, serves the cache instantly on open, and
 * refreshes over the network (`cache-and-network`). The shell socket
 * (DashboardLayout) merges realtime arrivals into the SAME cache windows —
 * this component NEVER opens a WebSocket (REQ-067).
 *
 * Mutation posture: mark-one / mark-all run through the shared
 * `useNotificationMarkActions` hook (drawer-plan §3.1) so the count
 * decrement and the stale-window sweep behave IDENTICALLY to the feed page.
 *
 * Accessibility: the bell button owns `aria-haspopup` / `aria-expanded` /
 * `aria-controls` pointing here; Escape and click-away close through
 * Popover's defaults. The unread dot is `aria-hidden` — the bold title
 * carries the read-state distinction visually and the full per-row
 * read-state announcement stays on the feed page's rows.
 *
 * MUI v9 discipline: `sx`-only styling, palette via theme callbacks, content
 * as TEXT nodes through `Typography` only (the REQ-028 contract — honored
 * here even though the static scan roots at `frontend/views/notifications/**`).
 * RTL: the app sets document `dir` without `theme.direction` (the badge's
 * `[dir=rtl]` override precedent), so the popover's end-alignment flips via
 * the active locale.
 */
export function NotificationDrawer({ anchorEl, open, onClose }: Readonly<NotificationDrawerProps>): ReactNode {
  const t = useAppTranslation(Notifications);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  // Memoized so `useQuery` sees a stable variables identity across re-renders.
  const filter = useMemo<MyNotificationsFilterInput>(
    () => ({ isRead: null, type: null, limit: DRAWER_PAGE_SIZE, offset: 0 }),
    []
  );

  const listQuery = useQuery(myNotificationsQueryDocument, {
    variables: { filter },
    skip: !open,
    fetchPolicy: "cache-and-network",
  });
  // The badge's observer keeps this field warm; the drawer only reads it for
  // the mark-all affordance state (cache-first, no extra poll).
  const countQuery = useQuery(myUnreadNotificationCountQueryDocument, { skip: !open });

  const { markNotificationRead, markAllNotificationsRead } = useNotificationMarkActions("NotificationDrawer");
  const [markAllPending, setMarkAllPending] = useState(false);
  const [markReadPendingIds, setMarkReadPendingIds] = useState<readonly string[]>(NO_PENDING_IDS);
  const [retryPending, setRetryPending] = useState(false);

  const items = listQuery.data?.myNotifications.items ?? [];
  const unreadCount = countQuery.data?.myUnreadNotificationCount;
  const initialLoading = listQuery.loading && listQuery.data === undefined;
  const loadFailed = !initialLoading && listQuery.error !== undefined;

  // The app sets document `dir` per locale but never `theme.direction` — flip
  // the popover's END alignment explicitly (the badge RTL-override precedent).
  const isRtl = locale === "ar";

  /**
   * Row activation: mark read when unread (fire-and-forget — the cache
   * restyles the row) and close; the row IS a real anchor to
   * `/notifications` (Link), so navigation is native — no router call.
   */
  const handleOpenNotification = (item: MyNotificationsQuery_myNotifications_items): void => {
    if (!item.isRead) {
      setMarkReadPendingIds(prev => [...prev, item.id]);
      void markNotificationRead({ id: item.id, wasUnread: true, activeFilter: filter }).finally(() => {
        setMarkReadPendingIds(prev => withoutPendingId(prev, item.id));
      });
    }
    onClose();
  };

  /** Header sweep: shared action; the drawer surfaces no count snackbar. */
  const handleMarkAll = (): void => {
    setMarkAllPending(true);
    void (async () => {
      await markAllNotificationsRead(filter);
      setMarkAllPending(false);
    })();
  };

  const handleRetry = (): void => {
    setRetryPending(true);
    void (async () => {
      try {
        await listQuery.refetch();
      } catch (error: unknown) {
        logger.debug({ caller: "NotificationDrawer" }, "[NotificationDrawer] Retry refetch rejected", {
          errorName: error instanceof Error ? error.name : typeof error,
        });
      } finally {
        setRetryPending(false);
      }
    })();
  };

  /**
   * Settled list region — early-return branches (skeleton → error → empty →
   * rows) instead of a nested ternary chain (`sonarjs/no-nested-conditional`).
   */
  const renderBody = (): ReactNode => {
    if (initialLoading) {
      return (
        <Box component="output" aria-busy="true" data-testid="notification-drawer-skeleton" sx={{ px: 2, py: 2 }}>
          <Stack spacing={2}>
            {SKELETON_ROW_KEYS.map(key => (
              <Stack key={key} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                <Skeleton variant="circular" sx={{ width: 8, height: 8, flexShrink: 0 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Skeleton variant="text" sx={{ fontSize: "0.875rem", maxWidth: 220 }} />
                  <Skeleton variant="text" sx={{ fontSize: "0.8125rem" }} />
                </Box>
              </Stack>
            ))}
          </Stack>
        </Box>
      );
    }
    if (loadFailed) {
      return (
        <Stack spacing={1.5} data-testid="notification-drawer-error" sx={{ px: 2, py: 3, alignItems: "flex-start" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t.loadErrorTitle}
          </Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.loadErrorBody}
          </Typography>
          <Button
            variant="outlined"
            size="small"
            disabled={retryPending}
            onClick={handleRetry}
            sx={{ ...focusVisibleRingSx, minHeight: 44 }}
          >
            {commonT.retry}
          </Button>
        </Stack>
      );
    }
    if (items.length === 0) {
      return (
        <Stack spacing={0.5} data-testid="notification-drawer-empty" sx={{ px: 2, py: 3, textAlign: "center" }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t.emptyTitle}
          </Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.emptyBody}
          </Typography>
        </Stack>
      );
    }
    return (
      <List disablePadding data-testid="notification-drawer-list" aria-label={t.title}>
        {items.map((item, index) => (
          <ListItemButton
            key={item.id}
            component={Link}
            href="/notifications"
            divider={index < items.length - 1}
            onClick={() => handleOpenNotification(item)}
            sx={{ ...focusVisibleRingSx, alignItems: "flex-start", gap: 1.5, px: 2, py: 1.5 }}
          >
            <Box aria-hidden sx={{ width: 8, flexShrink: 0, paddingTop: "7px" }}>
              {item.isRead ? null : (
                <Box
                  data-testid="notification-drawer-unread-dot"
                  sx={theme => ({ width: 8, height: 8, borderRadius: "50%", bgcolor: theme.palette.primary.main })}
                />
              )}
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "baseline", justifyContent: "space-between" }}>
                <Typography
                  variant="body2"
                  // Emitter copy can be either script regardless of UI locale —
                  // `dir="auto"` isolates it from the surrounding direction so
                  // trailing punctuation never wraps to the wrong edge.
                  dir="auto"
                  sx={theme => ({
                    fontWeight: item.isRead ? 400 : 700,
                    color: theme.palette.text.primary,
                    minWidth: 0,
                  })}
                >
                  {item.title}
                </Typography>
                <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary, flexShrink: 0 })}>
                  <time dateTime={item.createdAt}>{formatApplicantDate(item.createdAt, locale)}</time>
                </Typography>
              </Stack>
              {item.body === null ? null : (
                <Typography
                  variant="body2"
                  // Same bidi isolation as the title (see above).
                  dir="auto"
                  sx={theme => ({
                    color: theme.palette.text.secondary,
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp: 2,
                    overflow: "hidden",
                  })}
                >
                  {item.body}
                </Typography>
              )}
            </Box>
          </ListItemButton>
        ))}
      </List>
    );
  };

  return (
    <Popover
      id="notification-drawer"
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: isRtl ? "left" : "right" }}
      transformOrigin={{ vertical: "top", horizontal: isRtl ? "left" : "right" }}
      slotProps={{
        paper: {
          sx: theme => ({
            width: "min(400px, calc(100vw - 16px))",
            mt: 1,
            borderRadius: 2,
            bgcolor: theme.palette.background.paper,
            display: "flex",
            flexDirection: "column",
          }),
        },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", px: 2, py: 0.5 }}>
        <Typography variant="subtitle1" component="h2" sx={{ fontWeight: 700 }}>
          {t.title}
        </Typography>
        <Button
          size="small"
          variant="text"
          disabled={markAllPending || unreadCount === 0 || markReadPendingIds.length > 0}
          onClick={handleMarkAll}
          sx={{ ...focusVisibleRingSx, minHeight: 36 }}
        >
          {t.markAllRead}
        </Button>
      </Stack>
      <Divider />
      <Box sx={{ maxHeight: 360, overflowY: "auto" }}>{renderBody()}</Box>
      <Divider />
      <Box sx={{ px: 1, py: 0.5 }}>
        <Button
          component={Link}
          href="/notifications"
          onClick={onClose}
          fullWidth
          variant="text"
          sx={{ ...focusVisibleRingSx, justifyContent: "center", minHeight: 44 }}
        >
          {t.viewAllNotifications}
        </Button>
      </Box>
    </Popover>
  );
}
