"use client";

import { useQuery } from "@apollo/client/react";
import { Close as CloseIcon, DoneAllOutlined } from "@mui/icons-material";
import { Alert, Box, Button, IconButton, Snackbar, Stack, Typography } from "@mui/material";
import { type ReactNode, useMemo, useState } from "react";
// audit-R4: shared keyboard-focus ring (v9 ButtonBase ships none).
import { focusVisibleRingSx } from "@/frontend/components/ui/focusRing";
import type { MyNotificationsFilterInput, NotificationType } from "@/frontend/graphql/generated/gql/graphql";
import {
  myNotificationsQueryDocument,
  myUnreadNotificationCountQueryDocument,
} from "@/frontend/graphql/sharedDocuments";
import { useNotificationMarkActions } from "@/frontend/hooks/use-notification-mark-actions";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { logger } from "@/frontend/lib/logger";
import { MarkAllButton } from "@/frontend/views/notifications/MarkAllButton";
import { NotificationFeedError } from "@/frontend/views/notifications/NotificationFeedError";
import {
  NotificationFilterChips,
  type NotificationReadFilter,
} from "@/frontend/views/notifications/NotificationFilterChips";
import {
  NotificationEmptyState,
  NotificationList,
  NotificationSkeletonList,
} from "@/frontend/views/notifications/NotificationList";
import { darkOutlinedContrastSx } from "@/frontend/views/notifications/outlined-button-contrast";
import { Common, Notifications, useAppLocale, useAppTranslation } from "@/shared/locale";

/**
 * Feed page size — mirrors the engine's default inbox window
 * (`NOTIFICATION_INBOX_DEFAULT_PAGE_LIMIT = 20`; cap 50). The frontend keeps
 * its own constant: view layers never import backend service modules.
 */
const NOTIFICATIONS_PAGE_SIZE = 20;

/**
 * Unread-count polling cadence — the conventional notification-count posture
 * (`NOTIFICATION_COUNT_POLL_INTERVAL_MS`, `frontend/AGENTS.md`: 120s). The
 * realtime socket merges arrivals into the cache without refetches; this
 * poll is the silent-degradation floor (REQ-064).
 */
const NOTIFICATION_COUNT_POLL_INTERVAL_MS = 120_000;

/** Mark-all success snackbar auto-hide cadence (host toast posture). */
const MARK_ALL_SNACKBAR_AUTOHIDE_MS = 6000;

/** Removes one id from the pending mark-read set (state-updater helper). */
function withoutPendingId(ids: readonly string[], id: string): readonly string[] {
  return ids.filter(pendingId => pendingId !== id);
}

/**
 * NotificationsFeedContainer — the `/notifications` inbox surface
 * (REQ-063b): filter chips (read-state toggle + one chip per
 * `NotificationType`), the paginated row list with per-row mark-read, the
 * mark-all sweep with a translated affected-count snackbar, and the
 * loading/empty/error branches.
 *
 * Feed truth is the Apollo cache (plan D11): the shell-mounted
 * `useNotificationRealtime` socket (DashboardLayout) merges arrivals into
 * the same `myNotifications` variants this container queries — this file
 * NEVER mounts its own socket (REQ-067). Filter and pagination state live in
 * local React state; there is no Zustand store.
 *
 * Polling posture: only the unread count polls (120s); the list converges
 * through pagination, sweeps, and the realtime merge.
 *
 * MUI v9 discipline: `sx`-only styling, `theme.palette.*` via theme
 * callbacks, `*Outlined` icons, logical RTL properties, content as TEXT
 * nodes through `Typography` only (REQ-028).
 */
export function NotificationsFeedContainer(): ReactNode {
  const t = useAppTranslation(Notifications);
  const commonT = useAppTranslation(Common);
  const locale = useAppLocale();

  // Filter + pagination state — local component state (plan §5.4). The
  // filter object is memoized so `useQuery` sees a stable variables identity
  // while the filters are unchanged (re-renders never re-key the observable).
  const [readFilter, setReadFilter] = useState<NotificationReadFilter>("all");
  const [typeFilter, setTypeFilter] = useState<NotificationType | null>(null);
  const [page, setPage] = useState(0);

  // Row-level mark-read pending ids + the mark-all sweep surface state.
  const [markReadPendingIds, setMarkReadPendingIds] = useState<readonly string[]>([]);
  const [markAllPending, setMarkAllPending] = useState(false);
  const [markAllAffectedCount, setMarkAllAffectedCount] = useState<number | null>(null);
  const [retryPending, setRetryPending] = useState(false);

  const filter = useMemo<MyNotificationsFilterInput>(
    () => ({
      isRead: readFilter === "unread" ? false : null,
      type: typeFilter,
      limit: NOTIFICATIONS_PAGE_SIZE,
      offset: page * NOTIFICATIONS_PAGE_SIZE,
    }),
    [readFilter, typeFilter, page]
  );

  const listQuery = useQuery(myNotificationsQueryDocument, { variables: { filter } });
  const countQuery = useQuery(myUnreadNotificationCountQueryDocument, {
    pollInterval: NOTIFICATION_COUNT_POLL_INTERVAL_MS,
  });

  // Mark-one / mark-all cache maintenance is shared with the app-bar drawer
  // through `useNotificationMarkActions` (drawer-plan §3.1); pending state
  // stays local.
  const { markNotificationRead, markAllNotificationsRead } = useNotificationMarkActions("NotificationsFeedContainer");

  const pageData = listQuery.data?.myNotifications;
  const items = pageData?.items ?? [];
  const unreadCount = countQuery.data?.myUnreadNotificationCount;
  const errorCode = listQuery.error === undefined ? null : extractErrorCode(listQuery.error);

  /**
   * Mark-one: delegates to the shared action (cache normalization + count
   * decrement + stale-window drop, spared at the ACTIVE filter); this file
   * only owns the row pending bookkeeping.
   */
  const handleMarkRead = (id: string): void => {
    const wasUnread = items.some(item => item.id === id && !item.isRead);
    setMarkReadPendingIds(prev => [...prev, id]);
    void markNotificationRead({ id, wasUnread, activeFilter: filter }).finally(() => {
      setMarkReadPendingIds(prev => withoutPendingId(prev, id));
    });
  };

  /**
   * Mark-all: the shared sweep narrows to the ACTIVE type filter
   * (type-aware mark-all); on success the translated affected-count snackbar
   * surfaces (a `null` resolution = rejected mutation → no snackbar).
   */
  const handleMarkAll = (): void => {
    setMarkAllPending(true);
    void (async () => {
      const affectedCount = await markAllNotificationsRead(filter);
      if (affectedCount !== null) {
        setMarkAllAffectedCount(affectedCount);
      }
      setMarkAllPending(false);
    })();
  };

  const handleRetry = (): void => {
    setRetryPending(true);
    void (async () => {
      try {
        await listQuery.refetch();
      } catch (error: unknown) {
        logger.debug({ caller: "NotificationsFeedContainer" }, "[NotificationsFeed] Retry refetch rejected", {
          errorName: error instanceof Error ? error.name : typeof error,
        });
      } finally {
        setRetryPending(false);
      }
    })();
  };

  // Filter changes reset pagination — a new window starts at offset 0.
  // Single-selection semantics (QA round 2): "All" IS the unfiltered reset —
  // selecting it also drops an active category filter, so the rail can never
  // show "All" and a type chip pressed at the same time (clicking "All"
  // while a category is active was a dead button that left the list
  // narrowed). "Unread" keeps its orthogonal read-state interplay.
  const handleReadFilterChange = (next: NotificationReadFilter): void => {
    setReadFilter(next);
    if (next === "all") {
      setTypeFilter(null);
    }
    setPage(0);
  };
  const handleTypeFilterChange = (next: NotificationType | null): void => {
    setTypeFilter(next);
    setPage(0);
  };

  const totalPages = Math.max(1, Math.ceil((pageData?.totalCount ?? 0) / NOTIFICATIONS_PAGE_SIZE));
  const initialLoading = listQuery.loading && listQuery.data === undefined;
  const markAllDisabled = listQuery.loading || markAllPending || items.length === 0 || unreadCount === 0;
  const pagerVisible = page > 0 || (pageData?.hasMore ?? false);

  /**
   * Settled feed body — early-return branches (skeleton → error → empty →
   * list + pager) instead of a nested ternary chain
   * (`sonarjs/no-nested-conditional`).
   */
  const renderFeedBody = (): ReactNode => {
    if (initialLoading) {
      return <NotificationSkeletonList />;
    }
    if (errorCode !== null) {
      return (
        <NotificationFeedError
          labels={t}
          commonLabels={commonT}
          errorCode={errorCode}
          onRetry={handleRetry}
          retryPending={retryPending}
        />
      );
    }
    if (items.length === 0) {
      return <NotificationEmptyState labels={t} />;
    }
    return (
      <Stack spacing={2}>
        <NotificationList
          items={items}
          labels={t}
          locale={locale}
          onMarkRead={handleMarkRead}
          markReadPendingIds={markReadPendingIds}
          busy={markAllPending}
        />
        {pagerVisible ? (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}
          >
            <Button
              variant="outlined"
              size="small"
              disabled={page === 0 || listQuery.loading}
              onClick={() => setPage(current => Math.max(0, current - 1))}
              // QA round 2 (axe serious): dark-mode outlined text/border lift.
              sx={theme => ({
                ...focusVisibleRingSx,
                ...darkOutlinedContrastSx(theme),
                minHeight: 44,
              })}
            >
              {commonT.previousPage}
            </Button>
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {page + 1} / {totalPages}
            </Typography>
            <Button
              variant="outlined"
              size="small"
              disabled={!(pageData?.hasMore ?? false) || listQuery.loading}
              onClick={() => setPage(current => current + 1)}
              // QA round 2 (axe serious): dark-mode outlined text/border lift.
              sx={theme => ({
                ...focusVisibleRingSx,
                ...darkOutlinedContrastSx(theme),
                minHeight: 44,
              })}
            >
              {commonT.nextPage}
            </Button>
          </Stack>
        ) : null}
      </Stack>
    );
  };

  return (
    <Stack spacing={{ xs: 2, sm: 3 }} sx={{ width: "100%" }}>
      <Stack
        spacing={2}
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          justifyContent: "space-between",
        }}
      >
        <Stack spacing={0.5}>
          <Typography variant="h5" component="h1" sx={{ fontWeight: 700 }}>
            {t.title}
          </Typography>
          {typeof unreadCount === "number" ? (
            <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
              {t.unreadCount(unreadCount)}
            </Typography>
          ) : null}
        </Stack>
        <MarkAllButton
          labels={t}
          commonLabels={commonT}
          disabled={markAllDisabled}
          pending={markAllPending}
          onConfirm={handleMarkAll}
        />
      </Stack>

      <NotificationFilterChips
        labels={t}
        commonLabels={commonT}
        readFilter={readFilter}
        onReadFilterChange={handleReadFilterChange}
        typeFilter={typeFilter}
        onTypeFilterChange={handleTypeFilterChange}
        disabled={listQuery.loading && items.length === 0}
      />

      {renderFeedBody()}

      {markAllAffectedCount !== null ? (
        <Box
          sx={theme => ({
            position: "fixed",
            insetInlineStart: 0,
            insetInlineEnd: 0,
            // Raised clear of BOTH existing bottom-center snackbar stacks:
            // the error host anchors at 16/24 and the realtime toast stack at
            // 96/104 — one further toast height keeps this single success
            // snackbar from occluding (or being occluded by) either.
            bottom: { xs: 188, sm: 196 },
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            px: 2,
            zIndex: theme.zIndex.snackbar,
            pointerEvents: "none",
          })}
        >
          <Snackbar
            open
            autoHideDuration={MARK_ALL_SNACKBAR_AUTOHIDE_MS}
            onClose={(_, reason) => {
              if (reason !== "clickaway") {
                setMarkAllAffectedCount(null);
              }
            }}
            sx={{
              position: "static",
              maxWidth: { xs: "100%", sm: 480 },
              pointerEvents: "auto",
            }}
          >
            <Alert
              severity="success"
              variant="filled"
              icon={<DoneAllOutlined fontSize="small" />}
              action={
                <IconButton
                  aria-label={commonT.close}
                  size="small"
                  onClick={() => setMarkAllAffectedCount(null)}
                  // audit-R4: shared keyboard-focus ring (v9 ButtonBase ships none).
                  sx={{ ...focusVisibleRingSx, color: "inherit" }}
                >
                  <CloseIcon fontSize="small" />
                </IconButton>
              }
              sx={theme => ({
                alignItems: "center",
                borderRadius: 2,
                boxShadow: theme.shadows[6],
                maxWidth: { xs: "calc(100vw - 32px)", sm: 480 },
              })}
            >
              <Typography sx={{ fontSize: 14, lineHeight: 1.45 }}>{t.markAllResult(markAllAffectedCount)}</Typography>
            </Alert>
          </Snackbar>
        </Box>
      ) : null}
    </Stack>
  );
}
