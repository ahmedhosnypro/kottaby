# DEV3-016 Admin User Management — UI Refactor to Prototype Parity

**Goal:** make the implemented Admin User Management surfaces visually match the prototype
images under `../prototype/` to a 10/10 visual-parity score, in both light and dark mode,
RTL and LTR, desktop and mobile.

**Primary evidence:**
- Prototypes (design target): `../prototype/*.png` (6 files).
- Baseline captures of the CURRENT implementation (dev server, port **3001**):
  `scratch/screenshots/impl-*.png` (dark) and `scratch/screenshots/light-*.png` (light),
  plus `an-*.png` downscaled analysis copies.

---

## 1. Current state vs prototype — summary of gaps

The current implementation works functionally but diverges structurally from the prototype:

- **Layout grammar differs everywhere.** Directory page has a stat-card row + role-count
  caption + filter card the prototype never shows; prototype has a single toolbar card and a
  wide, airy table. Detail pages have sparse label/value gaps, dead vertical space, and
  text-link actions; prototype has a rich hero card, balanced 2-column card grid, and real
  buttons.
- **Component vocabulary differs.** Prototype uses soft tonal chips (tinted bg + on-tint
  text), a kebab actions menu, a segmented role control, a decorative hero, an application
  stepper, tinted icon-tile rows, and timeline entries. Implementation uses solid filled
  chips, verbal text buttons stacked per row, plain selects, and flat label/value lists.
- **Dialogs.** Create dialog lacks the subtitle, segmented role picker, phone-prefix chip,
  helper lines, info callout, and close (×) button. Deactivate dialog lacks the centered
  warning composition (icon halo, centered copy, left-accent info callout, wide error CTA)
  and mixes "حذف" (delete) wording into a soft-deactivate flow.
- **Polish defects found during baseline:** phone numbers render bidi-flipped
  (`201000000004+`), long emails wrap mid-token inflating row heights, the same status chip
  is shown 3× on detail pages using two different Arabic terms (نشط vs مفعّل), governance
  card is ~65% empty, values in label/value rows are center-aligned instead of column-aligned.

The app shell (top bar + sidebar in `DashboardLayout`) and the global theme palette are
**shared app infrastructure** and stay out of scope (see §3 decisions).

## 2. In scope

All under `frontend/views/admin/users/**` plus their i18n namespace:

| Surface | Prototype file | Current implementation |
|---|---|---|
| Directory — desktop table | `user-directory.png` | `AdminUsersDirectoryContainer.tsx` (table branch) |
| Directory — mobile cards | `user-directory-mobile.png` | same file (mobile branch) |
| Detail — teacher | `user-detail-teacher.png` | `AdminUserDetailContainer.tsx` |
| Detail — student | `user-detail-student.png` | same file |
| Create dialog | `create-user-dialog.png` | inline `CreateUserDialog` in directory container |
| Edit dialog | `deactivate-edit-dialogs.png` (background) | `AdminUserDialogs.tsx` (`EditUserDialog`) |
| Deactivate dialog | `deactivate-edit-dialogs.png` (front) | `AdminUserDialogs.tsx` (`DeleteConfirmDialog`) |

i18n: `shared/locale/types/adminUsers/index.ts`, `shared/locale/en/adminUsers/index.ts`,
`shared/locale/ar/adminUsers/index.ts`.

**No backend, no GraphQL document, no repository changes.** All fields needed for the
prototype tables/cards already exist on `AdminUserListItemReturnType` (`phone`,
`lastActiveAt`, governance booleans, role-child headlines) and `AdminUserDetailReturnType`
(`applicant`, `teacher`, `student`, `parent` snapshots). Frontend-only refactor.

The two `app/(dashboard)/admin/users/**/page.tsx` server components change at most to pass
extended `labels` (new i18n keys).

## 3. Design decisions (recorded, not assumptions)

1. **Prototype = target for structure and styling; theme tokens replace prototype hexes.**
   AGENTS.md forbids hardcoded colors, so prototype hex values map to semantic palette
   tokens (§4). Hues therefore follow the app's Material 3 brand palette rather than the
   prototype's literal indigo — the *design language* (soft tonal chips, border-based
   elevation, radius scale, spacing) is what gets ported. Dark mode comes for free because
   every token has a dark counterpart.
2. **Stat-card row + role-counts caption are removed from the directory page.** The
   prototype directory has no stat strip; the filters they trigger remain available via the
   toolbar selects (and mobile chips). `AdminUserStatsQuery` stays in the codebase (may be
   re-used by dashboards later) — only this page stops rendering it.
3. **No checkbox column, no Export button.** The prototype shows both, but there is no
   bulk-action or export backend contract; dead controls are worse than missing ones.
   Recorded as deferred follow-ups (not implemented here).
4. **App shell (sidebar/top bar) unchanged.** The prototype's navy left sidebar is a
   product-wide shell decision, not a feature decision; re-skinning `DashboardLayout` from
   this feature branch is out of scope.
5. **Deactivate wording fixed.** The soft-delete flow gets deactivate semantics end-to-end
   (dialog title/body/CTA), matching the prototype ("Deactivate User?") and the actual
   backend behavior (guarded soft-delete, reactivatable).
6. **Kebab actions menu** replaces per-row verbal "Edit/Delete" buttons (prototype ACTIONS
   column is a vertical 3-dot button).
7. **Directory toolbar keeps the Clear-filters affordance** (existing behavior) in the
   Export slot's place; no fake Export.

## 4. Palette / token mapping (prototype → theme)

Never write a hex literal. Use theme callback sx or M3 sibling tokens:

| Prototype color | Role | Theme token |
|---|---|---|
| `#4F46E5` indigo (primary CTAs, active states) | primary accent | `theme.palette.primary` (family; text on it via `onPrimary`) |
| `#FFF` cards / `#F5F6FA` page | surfaces | `background.paper` / `background.default` (shell-owned) |
| `#E2E5EC` borders, no shadows | card border | `theme.palette.border.light`, `theme.palette.shadow.card` |
| `#EEF1F7` table header bg | subtle header fill | `surfaceContainerHigh` |
| `#E6F6EC` bg / `#1D7A46` text / green dot | Active governance chip | `successContainer` / `onSuccessContainer` + `success.main` dot |
| `#FFF4E0` bg / `#C07A1E` text | Pending/Review/Trial chip | `warningContainer` / `onWarningContainer` |
| `#BA1A1A` + `#FFF4F3` halo | destructive | `error.main` button / `errorContainer` halo + `onErrorContainer` |
| `#E0E4F2` bg / `#4A5470` text | neutral chips (Verified/Certified/code) | `surfaceContainerHighest` / `onSurfaceVariant` |
| `#DCE9FF` + left accent bar | info callouts | `infoContainer`-area + `info.main` icon/accent bar |
| `#ECEAFB` bg / violet text — Admin role chip | role tint | `secondaryContainer` / `onSecondaryContainer` |
| `#E0F4F2` teal | Teacher chip | `secondary` family container role |
| decorative indigo wash on hero | flourish | low-alpha `primary` via `alpha(theme.palette.primary.main, 0.06)` |
| stat panel bg `#EAEEF9` | inside Teacher Application card | `surfaceContainer` with `border.light` |

Status dot size 8px, chips pill radius, cards radius 12 (theme `shape.borderRadius` is 16 —
use explicit 12 on these surfaces per prototype), hairline dividers `theme.palette.divider`,
strong structural borders `theme.palette.border.main`.

RTL: all directional CSS via logical properties (`marginInlineStart`, `paddingInlineEnd`,
`borderInlineStart`, `textAlign: "start"`, `insetInlineEnd`) — never `marginLeft/Right` etc.

## 5. Work items (files)

All new components live in `frontend/views/admin/users/`. Split the two monolithic
containers (1036 + 823 lines) into focused files. Every file passes the per-file loop
(`bun run scripts/health/sub-loop.ts <file> --lifecycle lint`) before the next is built.

### 5.1 Directory page — `AdminUsersDirectoryContainer.tsx` rework + new files

- **NEW `DirectoryToolbar.tsx`**: white card, radius 12, 24px padding: search TextField
  (magnifier leading adornment, placeholder from `labels.toolbar.searchPlaceholder`),
  Role select, Status select, Country field, spacer, Clear-filters text button (only when
  filters active) and **Create User** contained button (`primary`, `AddOutlined` icon).
  Replaces `FilterBar` and absorbs the current debounced-search state.
- **NEW `DirectoryTable.tsx`**: prototype table —
  - Columns: USER (40px `UserAvatar` + name 15px/600 `text.primary` + email 13px
    `text.secondary`, name links to detail, email single-line ellipsis + `title` attr),
    PHONE (fixed `direction: "ltr"` span — kills the bidi `+` bug), ROLE (`RoleChip`,
    pill, tonal container colors), STATUS/DETAILS (per-role headline: italic
    `text.secondary` "System User" for admins without applicant data; tonal chips for
    Verified/Certified etc.), GOVERNANCE (8px `success.main` dot + label, tonal pill),
    LAST ACTIVE (relative time, `text.secondary`), ACTIONS (kebab `MoreVertOutlined`
    IconButton → MUI Menu: Edit / Deactivate or Reactivate (danger items `error` text)).
  - Header row: `surfaceContainerHigh` bg, headers uppercase 12px/600 letterspaced
    `text.secondary`; row height ~72–84px; dividers `border.light`; hover
    `action.hover`.
  - Data comes from the existing `AdminUserListItemReturnType` — no backend changes.
- **NEW `DirectoryPagination.tsx`**: inside the table card, divider above; left =
  `labels.pagination.showing(from, to, total)` (range bold), right = per-page select +
  MUI `Pagination` (`shape="rounded"`, `size="small"`, sibling-count from prototype:
  1 … current … last), selected page = filled `primary` square (6px radius) w/ `onPrimary`.
  Replaces raw `TablePagination` on this page.
- **NEW `MobileUserCardList.tsx`** (shown < md, replaces current mobile branch): per
  prototype — 14px-radius cards, 16px gaps, 12px padding; header row = 40px avatar,
  name 600, role pill, relative-time (`text.secondary`), kebab; hairline divider; body =
  label/value rows (`Status` …, `Governance` = dot + colored value text, not a pill on
  mobile per prototype); deleted state = whole card `action.disabledOpacity` text +
  `text-decoration: line-through` on name + gray role pill.
- **NEW `FilterChipsRow.tsx`** (mobile-only, horizontally scrollable): chips =
  All/Students/Active/Deleted quick filters mapping to existing role/governance filter
  state (composable with toolbar selects); selected chip = filled `primary` + `onPrimary`,
  unselected = outlined `outlineVariant`. Desktop keeps full toolbar.
- **Edit in container**: delete `StatsBar`, role-count caption, and old branches; keep the
  query hooks, filter state, dialog wiring.

### 5.2 Detail page — `AdminUserDetailContainer.tsx` rework + new files

- **NEW `UserDetailHero.tsx`**: full-width card (radius 12, border, `shadow.card`):
  96px avatar (role-tinted), name (xl, 700), chip row (role chip w/ icon, governance chip
  with dot, application-state chip when applicant), contact row (EmailOutlined,
  PhoneOutlined `dir=ltr`, LocationOnOutlined icons + values, `text.secondary`), meta row
  (Member Since / Last Active — Last Active in `success` when recent), right-aligned
  actions: **Edit Profile** contained `primary` (EditOutlined) + **Deactivate User**
  outlined `error` (BlockOutlined) — or Reactivate variant for deleted users. Subtle
  decorative alpha-primary wash on the trailing edge (optional flourish, low alpha).
  Removes the top text-link button row (back link stays).
- **NEW `ProfileInfoCard.tsx`**: title + edit IconButton (opens same edit dialog);
  label/value rows with hairline dividers (`divider`), values weight 500 `text.primary`,
  fixed label column ~40% (fixes center-alignment defect); dashed divider before
  Created/Updated At; footer tinted strip (`surfaceContainerLow`) with InfoOutlined +
  `labels.detail.profileReadonlyNote`.
- **NEW `GovernanceCard.tsx`**: title w/ GavelOutlined (primary); 2-col grid of
  ALL-CAPS eyebrow labels (`text.secondary`, 11px, letterspacing) over 500-weight values:
  STATUS (dot + value), SUSPENDED, BLOCKED, DELETED, SUSPENDED UNTIL (`—` em dash);
  footer strip `labels.detail.governanceNote`. No more 65%-empty card.
- **NEW `TeacherApplicationCard.tsx`** (teachers/applicants): title row (badge icon in
  `primary`, title 700, trailing application-state chip); caption; stats panel
  (`surfaceContainer` rounded, 3 columns uppercase eyebrow + value: VERIFICATION
  ATTEMPTS "N of 3", COOLDOWN UNTIL (— when none), SUBMITTED date); 3-step stepper
  (Submitted ✓ filled primary circle / Under Review ring + VisibilityOutlined eye /
  Certified AwardOutlined) — StatusActive-based; info note callout (`info` container,
  InfoOutlined, one-line); footer row Approved / Evaluator with CancelOutlined ⊗ icons
  mapped from `teacher.isApproved / isEvaluator` (Yes/No).
- **NEW `StudentStatusCard.tsx`** (students): title w/ SchoolOutlined; 4 rows, each =
  tinted squircle icon tile (12px radius, container color) + label (+ optional sub-line)
  + trailing tonal chip:
  Parent Linked (`FamilyRestroomOutlined`-equivalent from the MUI icon set actually
  imported elsewhere — verify availability before choosing) → Yes/No;
  Active Subscription (`MonitorOutlined`-equivalent) → Yes/No;
  Trial Status (HourglassEmptyOutlined) → sub-line `creditsLeft(n)` + amber chip;
  Handshake Code (TagOutlined) → neutral chip with the mono code.
  Values from `student` snapshot only; absent snapshot → card hidden (current behavior).
- **NEW `RecentActivityCard.tsx`**: title w/ HistoryOutlined + trailing text link
  "View All" (`primary`); vertical timeline (1px `divider` line, latest dot = filled
  `primary`, older = `surfaceVariant`); entry = action label (600) + `actorName ·
  relative time` (`text.secondary`); empty state keeps translated sentence but gets a
  proper centered empty treatment; footer full-width outlined button
  ("View Full Audit Log") linking to the existing audit surface when the entry list is
  non-empty.
- Container: orchestrates hero + grid (left 5/12: ProfileInfo + Governance; right 7/12:
  role card + activity) with 24px gutters; keeps not-found state, mutations wiring,
  snackbars.

### 5.3 Dialogs — `AdminUserDialogs.tsx` rebuild (+ create dialog moves here)

- **CreateUserDialog** (moved out of the directory container):
  - 3-band layout: header band (title + subtitle `labels.createDialog.subtitle` +
    Close IconButton `CloseOutlined`, `borderBottom: 1px border.light`),
    body band (`backgroundColor: surfaceContainerLowest` tint), footer band
    (border-top, actions row: Cancel text button + Create User contained `primary`).
  - **Segmented role control**: 3 equal segments in a `surfaceContainerHigh` track
    (radius 10, padding 4): Student (SchoolOutlined), Parent (family icon),
    Teacher Applicant (PersonAddAltOutlined). Selected = elevated white Paper pill with
    2px `success.main` inset border + `success.main` icon/text; unselected =
    `text.secondary`.
  - Fields 2-col grid: Full Name | Email (full error treatment — red label/border/
    helper + ErrorOutlined trailing); Phone (with start-adornment `+20`-style prefix chip
    surface — keep current country-code behavior: prefix from selected country, chip
    styled `surfaceContainerHigh`) | Country; Gender (half width); Initial Password full
    width (visibility toggle, helper row: InfoOutlined small + helper text).
  - Info callout at body bottom: `info` container bg, radius 10, InfoOutlined, text from
    `labels.createDialog.roleCallout(role)` — content varies with selected role.
- **EditUserDialog**: same 3-band treatment, Close button, subtitle, footer =
  Cancel (text) + Save Changes (contained `primary`); existing fields unchanged
  (name/phone/country/gender/DOB); phone field `dir="ltr"`.
- **DeleteConfirmDialog → Deactivate dialog** (keeps filename; internals reworked):
  - Centered composition: 56px `errorContainer` circle with `error.main`
    WarningAmberOutlined icon; centered title `labels.deleteConfirm.deactivateTitle`;
    centered body with bold interpolated user name (`deactivateBody(name)`);
  - Info callout: `info` container bg, 3px `info.main` **borderInlineStart** accent bar,
    InfoOutlined icon, `deactivateRoleNote(roleLabel)`.
  - Actions: Cancel (text) + Deactivate (contained `error`, wider, order preserved RTL).
  - Reactivate variant reuses the same composition with success container accent.
  - `USER_SELF_DEACTIVATION_FORBIDDEN` inline alert behavior preserved.

### 5.4 Cross-cutting fixes (fold into the files above)

- Phone bidi: every phone rendering wrapped `dir="ltr"` / `direction: ltr; unicode-bidi: isolate`.
- Emails/names: `noWrap` + `textOverflow: ellipsis` + `title` attr for the full value.
- Status vocabulary: single translation key for the active state reused everywhere
  (kills نشط vs مفعّل drift); governance headline reuses the same chip everywhere.
- Terminology: deactivate language (§3.5) throughout the delete dialog namespace keys'
  *values* (key names stay — no API churn).
- i18n additions in `shared/locale/{types,en,ar}/adminUsers/index.ts` (typed): toolbar
  placeholders, pagination `showing(from,to,total)`, hero chips/meta labels, card titles,
  stepper labels, stats labels, callout texts, segmented role labels, deactivate copy set
  (title/body/note/cta), profileReadonlyNote, governanceNote, viewAll/viewFullAuditLog.
  Arabic translations follow existing tone (formal MSA already used in the file).

## 6. Out of scope / deferred

- App shell re-skin (sidebar/topbar) — product-wide decision.
- Bulk-select checkbox column & Export button — no backend contract (deferred; do not fake).
- Global palette hue change — brand palette is owned at theme level.
- Audit-page browsing UI — DEV3-020 per plan's deferred ledger.

## 7. Verification loop (mandatory, per-iteration)

Every iteration runs this cycle; **no ReadMediaFile in the main agent or in the fixer
subagents** — image inspection only in dedicated single-image analyst subagents.

1. Implement a work item (§5) in one `coder` subagent per file cluster; run
   `bun run scripts/health/sub-loop.ts <file> --lifecycle lint` per touched file.
2. Capture screenshots with agent-browser, session `verify-*`, **port 3001 only**
   (never stop/restart the dev server; never touch ports 3000/3002):
   - `bun run scripts/browser-login.ts --inject --base-url http://localhost:3001`
     whenever a capture bounces to the login page.
   - Desktop 1512×950: `/admin/users`, `/admin/users/2`, `/admin/users/4`, create dialog,
     edit dialog, deactivate dialog. Mobile 390×844: `/admin/users`.
   - Each capture in BOTH light and dark mode (toggle via the "تبديل المظهر" button).
   - Save under `scratch/screenshots/iter-<n>/`; also write an `an-` downscaled copy
     (`magick <f> -resize '1100x>' an-<f>`) — analysts use the `an-` copies.
3. For EACH screenshot: spawn one fresh explore subagent that reads exactly that one
   image and returns the text §1–§10 report + a **10-criterion score card**
   (layout, spacing rhythm, color-token consistency, typography, component fidelity,
   icons, data treatment, responsive, RTL/bidi, polish/states — 0–10 each).
4. Orchestrator diffs analyst findings vs the prototype contract; any criterion < 10 ->
   fix and repeat from step 2. Iterate until every surface scores 10/10 in light+dark.
5. On dev-server errors: use the Next.js MCP port-3001 tools (`get_errors`,
   `get_compilation_issues`) for diagnostics. Never stop the dev server.
6. Final gate: `bun quality-gate` (tsgo → oxlint → biome → lint → duplicates).

Environment artifacts to ignore in scoring: Next.js dev "N" overlay badge,
journey-fixture long emails (they must ellipsize, not wrap — that IS scored).

## 8. Acceptance criteria

- [ ] All 7 surfaces match the prototype structure per §5 (light + dark, desktop + mobile).
- [ ] All 6 analyst-reviewed score cards reach 10/10 ×2 modes.
- [ ] No console/compile errors on the touched routes (MCP `get_errors` clean).
- [ ] `bun quality-gate` green.
- [ ] i18n: all new strings typed in `AdminUsersLabels` and translated in en+ar; no
      hardcoded user-facing strings; no hex colors anywhere in the touched files.
- [ ] Baseline defects fixed: phone bidi, email wrapping, duplicated status chips,
      governance dead space, deactivate wording.
