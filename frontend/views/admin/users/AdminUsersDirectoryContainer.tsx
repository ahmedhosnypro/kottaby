"use client";

/**
 * AdminUsersDirectoryContainer — the admin user directory client surface.
 *
 * Composes:
 *  - clickable stats strip (governance counters toggle the governance
 *    filter; role-distribution caption; trailing-7-day signups badge)
 *  - filter bar (role, governance, country, debounced search)
 *  - paginated user table with avatar initials, name→detail links, and
 *    role-child status chips
 *  - create dialog (whitelist input + VALIDATION field-error projection)
 *  - edit dialog (whitelist patch)
 *  - delete/reactivate confirm dialog with self-deactivation conflict alert
 *  - success snackbars after every completed write (create / update /
 *    soft-delete / reactivate)
 *
 * All chrome copy comes from the `AdminUsers` locale namespace (passed from
 * the server as `labels`). MUI v9 `sx`-only discipline; colors via
 * `theme.palette.*` callbacks; `*Outlined` icons; ≥44px touch targets;
 * responsive (stat cards + table ≥768px, stacked cards at 375px).
 */

import { useMutation, useQuery } from "@apollo/client/react";
import {
  AddOutlined as AddIcon,
  BlockOutlined as BlockIcon,
  CheckCircleOutlineOutlined as CheckCircleIcon,
  ClearOutlined as ClearIcon,
  DeleteOutlineOutlined as DeleteIcon,
  EditOutlined as EditIcon,
  PauseCircleOutlineOutlined as PauseCircleIcon,
  PeopleOutlineOutlined as PeopleIcon,
  PersonOutlineOutlined as PersonIcon,
  RefreshOutlined as RefreshIcon,
  SearchOutlined as SearchIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Link as MuiLink,
  Select,
  Skeleton,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import { type ReactNode, type SubmitEventHandler, useState } from "react";
import type {
  AdminCreateUserMutation,
  AdminSetUserDeletedMutation,
  AdminUpdateUserMutation,
  AdminUserGovernanceFilter,
  AdminUserStatsQuery,
  AdminUsersQuery,
  AdminUsersQueryVariables,
  UserRole,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminCreateUserMutationDocument,
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUserStatsQueryDocument,
  adminUsersQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode, extractErrorMessage, extractFieldErrors } from "@/frontend/lib/graphql-error-utils";
import { UserAvatar } from "@/frontend/views/admin/users/AdminUserAvatar";
import { DeleteConfirmDialog, EditUserDialog } from "@/frontend/views/admin/users/AdminUserDialogs";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type AdminUserListItem = AdminUsersQuery["adminUsers"]["items"][number];
type Role = "Admin" | "Teacher" | "Student" | "Parent";
type Governance = "Active" | "Suspended" | "Blocked" | "Deleted";

interface AdminUsersDirectoryContainerProps {
  readonly labels: AdminUsersLabels;
}

const DEFAULT_PAGE_SIZE = 25;

/**
 * Stable skeleton-row keys for the loading state. Hard-coded identifiers
 * (rather than array indices) keep React's reconciliation stable and
 * satisfy the `react/no-array-index-key` lint rule. Each key is a
 * constant — no React state lives on a skeleton row, so identity is
 * unambiguous.
 */
const SKELETON_ROWS = [
  "skeleton-row-1",
  "skeleton-row-2",
  "skeleton-row-3",
  "skeleton-row-4",
  "skeleton-row-5",
  "skeleton-row-6",
  "skeleton-row-7",
  "skeleton-row-8",
] as const;

export function AdminUsersDirectoryContainer({ labels }: AdminUsersDirectoryContainerProps): ReactNode {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [governanceFilter, setGovernanceFilter] = useState<Governance | "">("");
  const [countryFilter, setCountryFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<AdminUserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserListItem | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Debounce search input (300ms).
  if (searchInput !== searchDebounced) {
    setTimeout(() => setSearchDebounced(searchInput), 300);
  }

  const variables: AdminUsersQueryVariables = {
    filters: {
      role: roleFilter ? (roleFilter as unknown as UserRole) : null,
      governance: governanceFilter ? (governanceFilter as unknown as AdminUserGovernanceFilter) : null,
      country: countryFilter || null,
      search: searchDebounced || null,
    },
    page: page + 1,
    pageSize,
  };

  const { data, loading, error } = useQuery<AdminUsersQuery>(adminUsersQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  // Overview-stats strip — refreshed alongside the directory after every
  // write (all three mutations list the stats document in `refetchQueries`).
  const { data: statsData, loading: statsLoading } = useQuery<AdminUserStatsQuery>(adminUserStatsQueryDocument, {
    fetchPolicy: "cache-and-network",
  });

  // Every completed write re-fetches BOTH the directory page and the stats
  // strip so the counters stay honest without a manual reload.
  const refetchAfterWrite = [{ query: adminUsersQueryDocument, variables }, { query: adminUserStatsQueryDocument }];

  const [createUser, { loading: createLoading }] = useMutation<AdminCreateUserMutation>(
    adminCreateUserMutationDocument,
    { refetchQueries: refetchAfterWrite, awaitRefetchQueries: true }
  );
  const [updateUser, { loading: updateLoading }] = useMutation<AdminUpdateUserMutation>(
    adminUpdateUserMutationDocument,
    { refetchQueries: refetchAfterWrite, awaitRefetchQueries: true }
  );
  const [setDeleted, { loading: deleteLoading }] = useMutation<AdminSetUserDeletedMutation>(
    adminSetUserDeletedMutationDocument,
    { refetchQueries: refetchAfterWrite, awaitRefetchQueries: true }
  );

  const items = data?.adminUsers.items ?? [];
  const totalCount = data?.adminUsers.totalCount ?? 0;
  const firstErrorCode = error ? extractErrorCode(error) : null;

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 2 }}>
        <Typography variant="h4" component="h1">
          {labels.title}
        </Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)} sx={{ minHeight: 44 }}>
          {labels.createDialog.title}
        </Button>
      </Box>

      <StatsBar
        labels={labels}
        stats={statsData?.adminUserStats}
        loading={statsLoading}
        selectedGovernance={governanceFilter}
        onSelectGovernance={governance => {
          setGovernanceFilter(governance);
          setPage(0);
        }}
      />

      <FilterBar
        labels={labels}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        governanceFilter={governanceFilter}
        setGovernanceFilter={setGovernanceFilter}
        countryFilter={countryFilter}
        setCountryFilter={setCountryFilter}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
      />

      {firstErrorCode && (
        <Alert severity="error">
          {labels.errorState.title}: {firstErrorCode}
        </Alert>
      )}

      <DirectoryTable
        labels={labels}
        items={items}
        loading={loading}
        hasFilters={roleFilter !== "" || governanceFilter !== "" || countryFilter !== "" || searchDebounced !== ""}
        onEdit={setEditTarget}
        onDelete={setDeleteTarget}
      />

      <TablePagination
        component="div"
        count={totalCount}
        page={page}
        onPageChange={(_, newPage) => setPage(newPage)}
        rowsPerPage={pageSize}
        onRowsPerPageChange={e => {
          setPageSize(parseInt(e.target.value, 10) || DEFAULT_PAGE_SIZE);
          setPage(0);
        }}
        rowsPerPageOptions={[10, 25, 50, 100]}
        labelRowsPerPage={labels.pagination.pageSize}
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} ${labels.pagination.of} ${count}`}
      />

      {createOpen && (
        <CreateUserDialog
          labels={labels}
          loading={createLoading}
          onClose={() => setCreateOpen(false)}
          onSubmit={async input => {
            // NO try/catch here — rejections MUST propagate into the dialog's
            // own submit handler so VALIDATION field errors project inline
            // (`extractFieldErrors` on `extensions.fields`). The dialog closes
            // only on success (this line runs after the mutation resolves).
            await createUser({ variables: { input } });
            setCreateOpen(false);
            setSnackbarMessage(labels.snackbars.created);
          }}
        />
      )}

      {editTarget && (
        <EditUserDialog
          key={editTarget.id}
          labels={labels}
          user={editTarget}
          loading={updateLoading}
          onClose={() => setEditTarget(null)}
          onSubmit={async input => {
            // NO try/catch — rejections propagate into the dialog's submit
            // handler for inline field-error projection (see AdminUserDialogs).
            await updateUser({ variables: { id: editTarget.id, input } });
            setEditTarget(null);
            setSnackbarMessage(labels.snackbars.updated);
          }}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmDialog
          labels={labels}
          user={deleteTarget}
          loading={deleteLoading}
          onClose={() => setDeleteTarget(null)}
          onConfirm={async () => {
            // NO try/catch — rejections propagate into the dialog's confirm
            // handler: USER_SELF_DEACTIVATION_FORBIDDEN keeps the dialog open
            // with the warning alert; other codes leave it open for retry.
            const wasDeleted = deleteTarget.isDeleted;
            await setDeleted({ variables: { id: deleteTarget.id, deleted: !wasDeleted } });
            setDeleteTarget(null);
            setSnackbarMessage(wasDeleted ? labels.snackbars.reactivated : labels.snackbars.deleted);
          }}
        />
      )}

      <Snackbar
        open={snackbarMessage !== null}
        autoHideDuration={4000}
        onClose={() => setSnackbarMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" onClose={() => setSnackbarMessage(null)}>
          {snackbarMessage}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

type StatsData = NonNullable<AdminUserStatsQuery["adminUserStats"]>;

interface StatsBarProps {
  readonly labels: AdminUsersLabels;
  readonly stats: StatsData | undefined;
  readonly loading: boolean;
  readonly selectedGovernance: Governance | "";
  readonly onSelectGovernance: (governance: Governance | "") => void;
}

/**
 * Clickable overview strip above the directory table. Each governance card
 * toggles the matching governance filter (the total card clears it); the
 * selected card is visually anchored (primary border + selected surface).
 * `CardActionArea` is a `ButtonBase` — the whole card is one ≥44px touch
 * target that is focusable and keyboard-operable out of the box.
 *
 * Under the cards, a role-distribution caption line renders four outlined
 * chips (`<role label>: <count>`) — the caption reuses the singular
 * `roleLabels` (composed with the count in the component) so no new
 * pluralized copy is needed for either locale.
 */
function StatsBar(props: StatsBarProps): ReactNode {
  const { labels, stats, loading } = props;

  interface StatCardConfig {
    readonly key: string;
    readonly label: string;
    readonly value: number | undefined;
    readonly governance: Governance | "";
    readonly icon: ReactNode;
    readonly iconColor: "primary" | "success" | "warning" | "error";
  }

  const cards: readonly StatCardConfig[] = [
    {
      key: "stat-total",
      label: labels.stats.total,
      value: stats?.totalCount,
      governance: "",
      icon: <PeopleIcon />,
      iconColor: "primary",
    },
    {
      key: "stat-active",
      label: labels.stats.active,
      value: stats?.activeCount,
      governance: "Active",
      icon: <CheckCircleIcon />,
      iconColor: "success",
    },
    {
      key: "stat-suspended",
      label: labels.stats.suspended,
      value: stats?.suspendedCount,
      governance: "Suspended",
      icon: <PauseCircleIcon />,
      iconColor: "warning",
    },
    {
      key: "stat-blocked",
      label: labels.stats.blocked,
      value: stats?.blockedCount,
      governance: "Blocked",
      icon: <BlockIcon />,
      iconColor: "error",
    },
    {
      key: "stat-deleted",
      label: labels.stats.deleted,
      value: stats?.deletedCount,
      governance: "Deleted",
      icon: <DeleteIcon />,
      iconColor: "error",
    },
  ];

  const roleDistribution = stats
    ? [
        { key: "role-admins", label: labels.roleLabels.admin, count: stats.adminsCount },
        { key: "role-teachers", label: labels.roleLabels.teacher, count: stats.teachersCount },
        { key: "role-students", label: labels.roleLabels.student, count: stats.studentsCount },
        { key: "role-parents", label: labels.roleLabels.parent, count: stats.parentsCount },
      ]
    : [];

  return (
    <Stack spacing={1.5}>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(3, 1fr)", md: "repeat(5, 1fr)" },
          gap: 1.5,
        }}
      >
        {cards.map(card => {
          const selected = props.selectedGovernance === card.governance;
          return (
            <Card
              key={card.key}
              variant="outlined"
              sx={theme => ({
                ...(selected && {
                  borderColor: theme.palette.primary.main,
                  bgcolor: theme.palette.action.selected,
                }),
                transition: "border-color 150ms ease, background-color 150ms ease",
              })}
            >
              <CardActionArea
                onClick={() => props.onSelectGovernance(selected ? "" : card.governance)}
                sx={{ p: 2, minHeight: 44 }}
              >
                <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                  <Box
                    component="span"
                    aria-hidden
                    sx={theme => ({ display: "inline-flex", color: theme.palette[card.iconColor].main })}
                  >
                    {card.icon}
                  </Box>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h5" component="span" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                      {loading ? (
                        <Skeleton variant="text" width={28} sx={{ display: "inline-block" }} />
                      ) : stats ? (
                        card.value
                      ) : (
                        "—"
                      )}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={theme => ({
                        color: theme.palette.text.secondary,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      })}
                    >
                      {card.label}
                    </Typography>
                  </Box>
                  {card.key === "stat-total" && stats !== undefined && stats.newThisWeekCount > 0 && (
                    <Chip
                      size="small"
                      color="success"
                      variant="outlined"
                      label={`+${stats.newThisWeekCount} ${labels.stats.newThisWeek}`}
                      sx={{ mr: 0.5 }}
                    />
                  )}
                </Stack>
              </CardActionArea>
            </Card>
          );
        })}
      </Box>
      {stats !== undefined && (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
            {labels.stats.roleDistribution}:
          </Typography>
          {roleDistribution.map(entry => (
            <Chip
              key={entry.key}
              size="small"
              variant="outlined"
              label={`${entry.label}: ${entry.count}`}
              sx={theme => ({ color: theme.palette.text.secondary })}
            />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

interface FilterBarProps {
  readonly labels: AdminUsersLabels;
  readonly roleFilter: Role | "";
  readonly setRoleFilter: (v: Role | "") => void;
  readonly governanceFilter: Governance | "";
  readonly setGovernanceFilter: (v: Governance | "") => void;
  readonly countryFilter: string;
  readonly setCountryFilter: (v: string) => void;
  readonly searchInput: string;
  readonly setSearchInput: (v: string) => void;
}

function FilterBar(props: FilterBarProps): ReactNode {
  const { labels } = props;
  // Stable element ids — wire `InputLabel htmlFor` ↔ `Select id` so
  // screen readers announce the label when focus lands on the control
  // (axe-core `aria-input-field-name` rule). Ids are prefixed with the
  // component name to avoid collisions across FilterBar instances.
  const ROLE_FILTER_ID = "admin-users-filter-role";
  const GOVERNANCE_FILTER_ID = "admin-users-filter-governance";
  // "Clear filters" only renders when at least one filter is set; clears every
  // filter slot in one click rather than forcing the admin to reset each field.
  const hasFilters =
    props.roleFilter !== "" || props.governanceFilter !== "" || props.countryFilter !== "" || props.searchInput !== "";
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel htmlFor={ROLE_FILTER_ID}>{labels.filters.role}</InputLabel>
            <Select
              id={ROLE_FILTER_ID}
              value={props.roleFilter}
              label={labels.filters.role}
              onChange={e => props.setRoleFilter((e.target.value || "") as Role | "")}
            >
              <MenuItem value="">{labels.genderOptions.unspecified}</MenuItem>
              <MenuItem value="Admin">{labels.roleLabels.admin}</MenuItem>
              <MenuItem value="Teacher">{labels.roleLabels.teacher}</MenuItem>
              <MenuItem value="Student">{labels.roleLabels.student}</MenuItem>
              <MenuItem value="Parent">{labels.roleLabels.parent}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel htmlFor={GOVERNANCE_FILTER_ID}>{labels.filters.governance}</InputLabel>
            <Select
              id={GOVERNANCE_FILTER_ID}
              value={props.governanceFilter}
              label={labels.filters.governance}
              onChange={e => props.setGovernanceFilter((e.target.value || "") as Governance | "")}
            >
              <MenuItem value="">{labels.genderOptions.unspecified}</MenuItem>
              <MenuItem value="Active">{labels.statusBadges.active}</MenuItem>
              <MenuItem value="Suspended">{labels.statusBadges.suspended}</MenuItem>
              <MenuItem value="Blocked">{labels.statusBadges.blocked}</MenuItem>
              <MenuItem value="Deleted">{labels.statusBadges.deleted}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            size="small"
            label={labels.filters.country}
            value={props.countryFilter}
            onChange={e => props.setCountryFilter(e.target.value)}
            sx={{ minWidth: 140 }}
          />
          <TextField
            size="small"
            label={labels.filters.search}
            value={props.searchInput}
            onChange={e => props.setSearchInput(e.target.value)}
            sx={{ minWidth: 220, flex: 1 }}
            slotProps={{
              input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} /> },
            }}
          />
          {hasFilters && (
            <Button
              size="small"
              color="inherit"
              startIcon={<ClearIcon />}
              onClick={() => {
                props.setRoleFilter("");
                props.setGovernanceFilter("");
                props.setCountryFilter("");
                props.setSearchInput("");
              }}
              sx={{ alignSelf: "center", minHeight: 44, color: "text.secondary" }}
            >
              {labels.filters.clear}
            </Button>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}

interface DirectoryTableProps {
  readonly labels: AdminUsersLabels;
  readonly items: readonly AdminUserListItem[];
  readonly loading: boolean;
  readonly hasFilters: boolean;
  readonly onEdit: (user: AdminUserListItem) => void;
  readonly onDelete: (user: AdminUserListItem) => void;
}

function DirectoryTable(props: DirectoryTableProps): ReactNode {
  const { labels, items, loading, hasFilters, onEdit, onDelete } = props;
  return (
    <TableContainer component={Card} variant="outlined">
      <Table size="small" sx={{ display: { xs: "none", md: "table" } }}>
        <TableHead>
          <TableRow>
            <TableCell>{labels.headers.name}</TableCell>
            <TableCell>{labels.headers.email}</TableCell>
            <TableCell>{labels.headers.role}</TableCell>
            <TableCell>{labels.headers.country}</TableCell>
            <TableCell>{labels.headers.status}</TableCell>
            <TableCell align="right">{labels.headers.actions}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {loading && items.length === 0
            ? SKELETON_ROWS.map(rowKey => (
                <TableRow key={rowKey}>
                  <TableCell colSpan={6}>
                    <Skeleton variant="text" />
                  </TableCell>
                </TableRow>
              ))
            : items.map(u => (
                <TableRow key={u.id} hover>
                  <TableCell>
                    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
                      <UserAvatar fullName={u.fullName} role={u.role as unknown as Role} />
                      <MuiLink
                        component={Link}
                        href={`/admin/users/${u.id}`}
                        underline="hover"
                        aria-label={`${labels.quickActions.viewProfile}: ${u.fullName}`}
                        sx={{
                          display: "inline-flex",
                          alignItems: "center",
                          minHeight: 44,
                          minWidth: 44,
                          boxSizing: "border-box",
                        }}
                      >
                        {u.fullName}
                      </MuiLink>
                    </Stack>
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <RoleChip role={u.role as unknown as Role} labels={labels} />
                  </TableCell>
                  <TableCell>{u.country ?? "—"}</TableCell>
                  <TableCell>
                    <StatusChip user={u} labels={labels} />
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                      <Button size="small" startIcon={<EditIcon />} onClick={() => onEdit(u)}>
                        {labels.editDialog.title}
                      </Button>
                      <Button
                        size="small"
                        color={u.isDeleted ? "success" : "error"}
                        startIcon={u.isDeleted ? <RefreshIcon /> : <DeleteIcon />}
                        onClick={() => onDelete(u)}
                      >
                        {u.isDeleted ? labels.reactivateConfirm.confirm : labels.deleteConfirm.confirm}
                      </Button>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
          {!loading && items.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                <Stack spacing={1} sx={{ alignItems: "center" }}>
                  <PersonIcon color="disabled" sx={{ fontSize: 48 }} />
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {hasFilters ? labels.emptyState.filteredTitle : labels.emptyState.title}
                  </Typography>
                  <Typography color="text.secondary">
                    {hasFilters ? labels.emptyState.filteredMessage : labels.emptyState.message}
                  </Typography>
                </Stack>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {/* Mobile stacked cards */}
      <Stack spacing={1} sx={{ display: { xs: "flex", md: "none" }, p: 1 }}>
        {items.map(u => (
          <Card key={u.id} variant="outlined">
            <CardContent>
              <Stack spacing={1}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", minWidth: 0 }}>
                    <UserAvatar fullName={u.fullName} role={u.role as unknown as Role} size={32} />
                    <MuiLink
                      component={Link}
                      href={`/admin/users/${u.id}`}
                      underline="hover"
                      noWrap
                      sx={{
                        minWidth: 0,
                        display: "inline-flex",
                        alignItems: "center",
                        minHeight: 44,
                        boxSizing: "border-box",
                      }}
                      aria-label={`${labels.quickActions.viewProfile}: ${u.fullName}`}
                    >
                      {u.fullName}
                    </MuiLink>
                  </Stack>
                  <StatusChip user={u} labels={labels} />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {u.email}
                </Typography>
                <Box sx={{ display: "flex", gap: 1 }}>
                  <RoleChip role={u.role as unknown as Role} labels={labels} />
                  {u.country && <Chip size="small" label={u.country} variant="outlined" />}
                </Box>
                <Stack direction="row" spacing={1}>
                  <Button size="small" startIcon={<EditIcon />} onClick={() => onEdit(u)}>
                    {labels.editDialog.title}
                  </Button>
                  <Button
                    size="small"
                    color={u.isDeleted ? "success" : "error"}
                    startIcon={u.isDeleted ? <RefreshIcon /> : <DeleteIcon />}
                    onClick={() => onDelete(u)}
                  >
                    {u.isDeleted ? labels.reactivateConfirm.confirm : labels.deleteConfirm.confirm}
                  </Button>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </TableContainer>
  );
}

function RoleChip({ role, labels }: { role: Role; labels: AdminUsersLabels }): ReactNode {
  // Filled (not outlined) variant — outlined `color="primary"` on a
  // white cell fails WCAG AA contrast (the outlined variant renders
  // only the chip border + text in the theme color, leaving the
  // background white). The filled variant paints the chip background
  // in the theme color with white text, restoring contrast. Per the
  // QA report (Task 5-QA P0 finding).
  let color: "error" | "secondary" | "primary" | "default";
  let label: string;
  if (role === "Admin") {
    color = "error";
    label = labels.roleLabels.admin;
  } else if (role === "Teacher") {
    color = "secondary";
    label = labels.roleLabels.teacher;
  } else if (role === "Student") {
    color = "primary";
    label = labels.roleLabels.student;
  } else {
    color = "default";
    label = labels.roleLabels.parent;
  }
  return <Chip size="small" color={color} label={label} variant="filled" />;
}

function StatusChip({ user, labels }: { user: AdminUserListItem; labels: AdminUsersLabels }): ReactNode {
  let label: string;
  let color: "success" | "warning" | "error" | "default";
  if (user.isDeleted) {
    label = labels.statusBadges.deleted;
    color = "error";
  } else if (user.isBlocked) {
    label = labels.statusBadges.blocked;
    color = "error";
  } else if (user.suspended) {
    label = labels.statusBadges.suspended;
    color = "warning";
  } else {
    label = labels.statusBadges.active;
    color = "success";
  }
  return <Chip size="small" color={color} label={label} />;
}

interface CreateDialogProps {
  readonly labels: AdminUsersLabels;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly fullName: string;
    readonly email: string;
    readonly phone: string;
    readonly password: string;
    readonly gender?: "Male" | "Female" | "Other";
    readonly country: string;
    readonly role: "Student" | "Teacher" | "Parent";
  }) => Promise<void>;
}

function CreateUserDialog({ labels, loading, onClose, onSubmit }: CreateDialogProps): ReactNode {
  const CREATE_GENDER_ID = "admin-users-create-gender";
  const CREATE_ROLE_ID = "admin-users-create-role";
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    gender: "" as "" | "Male" | "Female" | "Other",
    country: "",
    role: "Student" as "Student" | "Teacher" | "Parent",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  // Top-level fallback for rejections WITHOUT a field payload (e.g. a
  // duplicate-email CONFLICT) — without it the dialog would stay open with
  // zero feedback, leaving the admin to guess why nothing happened.
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async e => {
    e.preventDefault();
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        gender: form.gender || undefined,
        country: form.country,
        role: form.role,
      });
    } catch (err) {
      const errors = extractFieldErrors(err as unknown);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
      } else {
        setFormError(extractErrorMessage(err as unknown));
      }
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{labels.createDialog.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <TextField
              label={labels.createDialog.fullName}
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              required
              error={!!fieldErrors.fullName}
              helperText={fieldErrors.fullName}
            />
            <TextField
              label={labels.createDialog.email}
              type="email"
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              required
              error={!!fieldErrors.email}
              helperText={fieldErrors.email}
            />
            <TextField
              label={labels.createDialog.phone}
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
              required
              error={!!fieldErrors.phone}
              helperText={fieldErrors.phone}
            />
            <TextField
              label={labels.createDialog.password}
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
              error={!!fieldErrors.password}
              helperText={fieldErrors.password}
            />
            <FormControl fullWidth>
              <InputLabel htmlFor={CREATE_GENDER_ID}>{labels.createDialog.gender}</InputLabel>
              <Select
                id={CREATE_GENDER_ID}
                value={form.gender}
                label={labels.createDialog.gender}
                onChange={e => setForm({ ...form, gender: e.target.value as "" | "Male" | "Female" | "Other" })}
              >
                <MenuItem value="">{labels.genderOptions.unspecified}</MenuItem>
                <MenuItem value="Male">{labels.genderOptions.male}</MenuItem>
                <MenuItem value="Female">{labels.genderOptions.female}</MenuItem>
                <MenuItem value="Other">{labels.genderOptions.other}</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label={labels.createDialog.country}
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
              required
              error={!!fieldErrors.country}
              helperText={fieldErrors.country}
            />
            <FormControl fullWidth>
              <InputLabel htmlFor={CREATE_ROLE_ID}>{labels.createDialog.role}</InputLabel>
              <Select
                id={CREATE_ROLE_ID}
                value={form.role}
                label={labels.createDialog.role}
                onChange={e => setForm({ ...form, role: e.target.value as "Student" | "Teacher" | "Parent" })}
              >
                <MenuItem value="Student">{labels.roleLabels.student}</MenuItem>
                <MenuItem value="Teacher">{labels.roleLabels.teacher}</MenuItem>
                <MenuItem value="Parent">{labels.roleLabels.parent}</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={loading} sx={{ minHeight: 44 }}>
            {labels.createDialog.cancel}
          </Button>
          <Button type="submit" variant="contained" disabled={loading} sx={{ minHeight: 44 }}>
            {labels.createDialog.submit}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/* EditUserDialog + DeleteConfirmDialog live in the shared AdminUserDialogs
 * module (also consumed by AdminUserDetailContainer for its inline header
 * actions) — see that file for the error-propagation contract. */
