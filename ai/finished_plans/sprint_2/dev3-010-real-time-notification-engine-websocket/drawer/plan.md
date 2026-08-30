# Notification Bell Drawer (Popover) — Plan

**Parent plan:** `ai/plans/sprint_2/dev3-010-real-time-notification-engine-websocket/` (implemented)
**Prototype:** `prototype/teacher-dashboard-bell-dropdown.png` (analyzed — contract below)
**Date:** 2026-08-30

---

## 1. Context & Goal

The parent plan shipped the notifications page (`/notifications`), the sidebar entry, the app-bar bell
(`NotificationUnreadBadge`) with the unread-count badge, and the realtime toast host. The piece that was
NOT built: the **floating notification drawer** — clicking the bell currently navigates straight to
`/notifications`.

Target behavior (per prototype + user request):

- Clicking the app-bar bell opens a **floating popover panel** anchored under the bell (MUI `Popover`),
  NOT a navigation.
- The notifications page remains reachable from the sidebar (already exists, no change) AND from a
  pinned footer button inside the drawer ("View all notifications").
- The drawer shows the latest notifications with header action "Mark all as read".

No backend, schema, GraphQL-document, or codegen changes. No WebSocket changes — the drawer never opens
a socket (REQ-067 stands; the shell socket in `DashboardLayout` co-maintains the Apollo cache the drawer
reads).

## 2. Prototype Contract (DR requirements)

| ID | Requirement |
|---|---|
| DR-1 | Bell click toggles a floating panel anchored beneath the bell, end-aligned (right in LTR, mirrored in RTL). ~400px max width, rounded corners, elevated (Popover/Paper), small gap below the app bar. |
| DR-2 | Pinned header: bold title ("Notifications") + right-aligned text-button "Mark all as read". No tabs, no filters, no settings icon. |
| DR-3 | Rows: unread dot (filled circle, palette accent) start-aligned + vertically centered on title line; bold title with end-aligned small muted timestamp; 1–2 line muted body under the title indent; NO avatars, type chips, or per-row buttons. Full-width hairline dividers between rows. Row click = mark read (if unread) + navigate to `/notifications` + close. |
| DR-4 | Pinned footer: centered text button "View all notifications" linking to `/notifications` (closes the drawer). |
| DR-5 | Fixed max height with internal list scrolling; pinned header + footer outside the scroll region. Loading skeletons / empty state / error+retry states inside the list region. |
| DR-6 | Badge count behavior unchanged (cache-driven + 120s poll floor). Drawer NEVER opens a WebSocket (REQ-067). |
| DR-7 | All strings via the compile-time `Notifications` namespace; exactly ONE new key (`viewAllNotifications`) added to types/en/ar. |
| DR-8 | Accessibility: bell button gets `aria-haspopup="dialog"` + `aria-expanded` + `aria-controls`; Popover closes on Escape/click-away; existing composed accessible label (`badgeAriaLabel — unreadCount(n)`) preserved. |

## 3. Affected layers & files

### 3.1 Extract shared mark-one / mark-all cache logic (duplication guard)

The mark-read and mark-all handlers in `frontend/views/notifications/NotificationsFeedContainer.tsx`
(lines ~100–248: `isInboxWindowForFilter`, `dropStaleInboxWindows`, `handleMarkRead` with the
`myUnreadNotificationCount` decrement, `handleMarkAll` with `refetchQueries` + sweep) must be reused by
the drawer WITHOUT copy-paste (jscpd gate). Extract to the neutral hooks layer:

- **NEW `frontend/hooks/use-notification-mark-actions.ts`**
  - `dropStaleInboxWindows(cache, activeFilter)` + the `isInboxWindowForFilter` helper (moved verbatim).
  - `useMarkNotificationRead()` → returns `markNotificationRead(id, wasUnread)` performing the mutation,
    the unread-count decrement, and the stale-window sweep on non-active windows (active window = the
    caller's current filter, passed as argument).
  - `useMarkAllNotificationsRead()` → returns `markAll(filter)` performing the mutation with
    `refetchQueries` + `awaitRefetchQueries`, the stale-window sweep, and resolving the affected count.
  - Error handling convention preserved: rejection logged via `logger.debug` (caller
    `[NotificationsFeed]`/`[NotificationDrawer]`), global error surface owns UX — hooks accept/return so
    callers keep their local pending-state shape. Keep the current `catch` + log behavior; hooks rethrow
    nothing (components currently swallow after logging — hook keeps that contract).
  - Imports: `@apollo/client` (`useMutation`, `useApolloClient`), documents from
    `@/frontend/graphql/sharedDocuments`, generated types from `@/frontend/graphql/generated/gql/graphql`,
    `logger` from `@/frontend/utils/logger`. Precedent for hooks→graphql imports:
    `frontend/hooks/use-notification-realtime.ts`.
- **EDIT `frontend/views/notifications/NotificationsFeedContainer.tsx`** — replace the inlined
  helpers/handlers with the hooks. Zero behavior change; local pending-state (`markReadPendingIds`,
  `markAllPending`, snackbar count state) stays in the container.

### 3.2 NEW `frontend/components/ui/NotificationDrawer.tsx`

Placement rationale: shell-level UI surface next to its trigger (`NotificationUnreadBadge`) and the
toast host; `frontend/components/ui/` → `frontend/hooks` + `@/frontend/graphql/sharedDocuments` +
`@/shared/locale` imports all have precedent (badge, toast host). NOT placed in `frontend/views/`
(no components→views import direction exists today and none is introduced).

Props: `{ anchorEl: HTMLElement | null; open: boolean; onClose: () => void }`.

- `Popover` (MUI v9) `open={open} anchorEl={anchorEl} onClose={onClose}`; `anchorOrigin`/
  `transformOrigin` end-aligned; RTL flip derived from `useAppLocale()` (app sets document `dir`, not
  `theme.direction` — same reasoning as the badge's `[dir=rtl]` override).
- Paper sx: `width: "min(400px, calc(100vw - 16px))"`, palette surface background via theme callback,
  rounded corners, elevation; structural Stack: header / scrollable list region (`maxHeight` ~ min(480px,
  60vh), `overflow: auto`) / foot er, `Divider`s between.
- Header: `Typography` title (`t.title`, bold) + `Button` variant="text" `t.markAllRead` — disabled while
  pending or when unread count is 0; on click runs `useMarkAllNotificationsRead()` with the drawer's
  active filter (`{ isRead: null, type: null, limit: DRAWER_PAGE_SIZE, offset: 0 }`). Direct action
  (prototype), no confirm dialog (the page keeps its dialog).
- Data: `useQuery(myNotificationsQueryDocument, { variables: { filter }, skip: !open, fetchPolicy:
  "cache-and-network" })` — cache serves instantly (socket-kept), network refreshes on open.
  `DRAWER_PAGE_SIZE = 5`.
- Rows (DR-3): `<List>` / row `ListItemButton` with:
  - unread dot: `Box` circle, `theme.palette.primary.main`, only when `!item.isRead` (layout space
    reserved so titles align whether or not the dot renders).
  - title `Typography` (`fontWeight` 700 when unread, 400 when read) + timestamp `Typography` end-aligned
    (same locale-aware formatting approach as `NotificationRow` — if its formatter is an exported helper,
    reuse it; otherwise replicate the same `Intl.DateTimeFormat` call inline, ≤5 lines).
  - body `Typography` with 2-line clamp (`display: -webkit-box` / `lineClamp` via sx), muted
    (`text.secondary`).
  - Row click: `markNotificationRead(id, wasUnread)` when unread, then `router.push("/notifications")`
    (`next/navigation`) + `onClose()`.
  - Text-only rendering through `Typography` (REQ-028 discipline), `sx`-only styling, palette via theme
    callbacks, MUI severity/accent slots only.
- List-region states: loading → 3 `Skeleton` rows; error → `t.loadErrorTitle`/`loadErrorBody` + retry
  `Button` (`listQuery.refetch()`, pending-guarded); empty → `t.emptyTitle`/`emptyBody`.
- Footer (DR-4): full-width `Button` variant="text" `component={Link} href="/notifications"`
  `onClick={onClose}`, label `t.viewAllNotifications`, centered.
- A11y (DR-8): Popover `id="notification-drawer"`; header region labelled; keep keyboard/Escape/click-away
  semantics from Popover defaults.
- Keep under the repo's file-size discipline; if the row markup pushes the file large, split the row into
  `NotificationDrawerRow.tsx` in the same directory.

### 3.3 EDIT `frontend/components/ui/NotificationUnreadBadge.tsx`

- Replace `component={Link} href="/notifications"` with local `anchorEl` state + `onClick` toggle.
- Add `aria-haspopup="dialog"`, `aria-expanded={open}`, `aria-controls` (drawer id when open).
- Render `<NotificationDrawer anchorEl={anchorEl} open={anchorEl !== null} onClose={close} />` as a
  sibling of the `Tooltip`.
- Update the component docblock (it currently documents the bell as a pure navigation entry).
- Badge, poll, tooltip, RTL override, zero-WS discipline unchanged.

### 3.4 i18n — ONE new key

- `shared/locale/types/notifications/index.ts`: add `readonly viewAllNotifications: string` (+ jsdoc);
  extend the header docblock surface list to mention the bell drawer.
- `shared/locale/en/notifications/index.ts`: `viewAllNotifications: "View all notifications"`.
- `shared/locale/ar/notifications/index.ts`: Arabic equivalent (e.g. "عرض كل الإشعارات").
- Parity: `notifications-namespace.parity.test.ts` covers key-set parity automatically — all three files
  updated in lockstep.

### 3.5 Tests (`test/ui/components/`)

- **EDIT `test/ui/components/notification-badge.test.tsx`**: bell is no longer a `Link` — update the
  app-bar integration / bell assertions to the drawer-toggle contract (click opens drawer keyed by
  `aria-expanded` / popover presence; sidebar link assertions unchanged). Keep all count/poll/cache/
  zero-WS assertions.
- **NEW `test/ui/components/notification-drawer.test.tsx`** (Happy DOM + Apollo `MockLink` +
  `createApolloCache()`, the badge/feed suite precedent):
  - opens on bell click (via `NotificationUnreadBadge` mount) and closes on Escape;
  - renders mocked rows; unread dot present for unread items only;
  - footer `viewAllNotifications` renders as a link to `/notifications`;
  - header mark-all: mutation fired, cached `myUnreadNotificationCount` reached 0 (cache-level
    assertion, the feed-suite precedent);
  - empty state, error+retry state;
  - zero `WebSocket` constructions while drawer opens/closes (REQ-067 recorder double);
  - both locales (`const locale: AppLocale = "en" | "ar"` per-file blocks) — ALL strings via
    `readTranslation(Notifications, locale)`; zero hardcoded copy.
  - Verify `Notifications` is preloaded in `translation-preload.ts` (feed suite already uses it — reuse,
    add only if missing).
- Extend `notifications-static-scan.test.ts` scope? The scan roots at `frontend/views/notifications/**`;
  the drawer lives in `frontend/components/ui/` — document in the drawer file header that the REQ-028
  text-only contract is honored (no `dangerouslySetInnerHTML`); do NOT widen the scan (minimal-change
  rule).

### 3.6 Explicitly OUT of scope

- Sidebar nav (already links `/notifications`).
- Realtime toast, WS engine, backend, GraphQL documents/codegen, `app/` router files.
- Tabs/filters/date-grouping inside the drawer (prototype explicitly has none).

## 4. Verification

1. Per-file loop per touched file: `bun run scripts/health/sub-loop.ts <file> --lifecycle lint`
   (read every AGENTS.md it prints).
2. Component tests: `bun run test/scripts/run-test.ts test/ui/components/notification-drawer.test.tsx`
   and the badge suite; then `bun run test:ui:components`.
3. `bun quality-gate` (tsgo → oxlint → biome → lint → duplicates). The hook extraction must keep
   `duplicates` green (that is its purpose) — no `jscpd:ignore`.
4. Optional manual browser check via `agent-browser` (snapshot/text assertions first, screenshots to
   `scratch/screenshots/`, any visual read delegated to a subagent).

## 5. Rule checklist (pre-reviewed against AGENTS.md)

- Types: only generated GraphQL types + `NotificationsLabels` — no local type defs; no service-layer
  types involved.
- Client surface uses Apollo hooks only (`useQuery`/`useMutation` from `@apollo/client/react`);
  documents already carry `id` fields; no `useLazyQuery`.
- MUI v9: `sx`-only styling, `*Outlined` icons, no shorthand layout props on Box/Stack, palette via
  theme callbacks, no hardcoded colors.
- i18n: `useAppTranslation(Notifications)`; single new key with en/ar/types lockstep; no hardcoded
  strings in code or tests.
- Logging: `logger` from `@/frontend/utils/logger`; no `console.*`.
- Barrel rules: no new barrels needed (components/ui has no barrel; consumers import file paths, as the
  badge is imported today).
- No Zustand store introduced (Apollo cache remains the single truth, plan D11).
- No `dangerouslySetInnerHTML` (REQ-028 text-only contract).
