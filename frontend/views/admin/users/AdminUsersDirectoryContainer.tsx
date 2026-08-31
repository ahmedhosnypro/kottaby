"use client";

/**
 * AdminUsersDirectoryContainer — the admin user directory client surface.
 *
 * Composes:
 *  - `DirectoryToolbar` (search + role/status/country filters + the Create
 *    User button; the mobile quick-filter `FilterChipsRow` sits between the
 *    toolbar and the results),
 *  - `DirectoryTable` (desktop, ≥md) with the `DirectoryPagination` footer
 *    bar injected as the card's pagination slot,
 *  - `MobileUserCardList` (mobile, <md) plus a mobile-only pagination bar,
 *  - a mobile-only create `Fab` (the desktop create affordance lives in the
 *    toolbar),
 *  - create dialog (whitelist input + VALIDATION field-error projection),
 *  - edit dialog (whitelist patch),
 *  - delete/reactivate confirm dialog with self-deactivation conflict alert,
 *  - success snackbars after every completed write (create / update /
 *    soft-delete / reactivate).
 *
 * The prototype-parity rework removed the overview stats strip, the
 * role-distribution caption, the legacy filter card, and the raw
 * `TablePagination`; `AdminUserStatsQuery`/`adminUserStatsQueryDocument`
 * remain in the codebase for other surfaces but this page no longer queries
 * them.
 *
 * All chrome copy comes from the `AdminUsers` locale namespace (passed from
 * the server as `labels`). MUI v9 `sx`-only discipline; colors via
 * `theme.palette.*` callbacks; `*Outlined` icons; ≥44px touch targets;
 * responsive (desktop table ≥md, stacked cards below).
 */

import { useMutation, useQuery } from "@apollo/client/react";
import { AddOutlined as AddIcon } from "@mui/icons-material";
import { Alert, Box, Card, Fab, Stack, Typography } from "@mui/material";
import { type ReactNode, useState } from "react";
// `UserRole` and `AdminUserGovernanceFilter` are emitted as runtime string
// enums by GraphQL codegen — they must be imported as VALUES (not
// `import type`) so we can use `UserRole.Admin` etc. as runtime constants
// in the `toUserRole` / `toGovernanceFilter` conversion helpers. The
// remaining specifiers are types-only and use the inline `type` keyword
// (keeps the single-import form clean under `verbatimModuleSyntax`).
import {
  AdminUserGovernanceFilter,
  type AdminUsersQueryVariables,
  UserRole,
} from "@/frontend/graphql/generated/gql/graphql";
import {
  adminCreateUserMutationDocument,
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUsersQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import {
  AdminUserSuccessSnackbar,
  DeleteConfirmDialog,
  EditUserDialog,
} from "@/frontend/views/admin/users/AdminUserDialogs";
import type { DirectoryGovernance, DirectoryRole } from "@/frontend/views/admin/users/adminUsersDirectory.helpers";
import { CreateUserDialog } from "@/frontend/views/admin/users/CreateUserDialog";
import { DirectoryPagination } from "@/frontend/views/admin/users/DirectoryPagination";
import type { DirectoryUserItem } from "@/frontend/views/admin/users/DirectoryRowCells";
import { DirectoryTable } from "@/frontend/views/admin/users/DirectoryTable";
import { DirectoryToolbar } from "@/frontend/views/admin/users/DirectoryToolbar";
import { FilterChipsRow } from "@/frontend/views/admin/users/FilterChipsRow";
import { MobileUserCardList } from "@/frontend/views/admin/users/MobileUserCardList";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

type Role = DirectoryRole;
type Governance = DirectoryGovernance;

/**
 * Runtime-validated conversion from the local `Role` string-literal union to
 * the GraphQL-codegen `UserRole` enum. `Role` and `UserRole` carry the same
 * underlying string values (`"Admin" | "Parent" | "Student" | "Teacher"`) but
 * TS treats them as distinct nominal types. The exhaustive switch below
 * performs a real per-branch mapping — no `as unknown as UserRole` cast
 * (which would trip `no-unsafe-type-assertion`). The branch set is the
 * complete `Role` union; if a new role is added to `Role` but not here, TS
 * will fail the noFallthroughCasesInSwitch / exhaustiveness check.
 */
function toUserRole(role: Role): UserRole {
  switch (role) {
    case "Admin":
      return UserRole.Admin;
    case "Teacher":
      return UserRole.Teacher;
    case "Student":
      return UserRole.Student;
    case "Parent":
      return UserRole.Parent;
  }
  // Exhaustive-switch fallback — TypeScript knows `Role` is fully covered
  // above, but `consistent-return` requires every code path to return OR
  // none. Return Student (the default role for new public registrations)
  // if a future Role member lands here without a case update.
  return UserRole.Student;
}

/**
 * Runtime-validated conversion from the local `Governance` string-literal
 * union to the GraphQL-codegen `AdminUserGovernanceFilter` enum. Same
 * rationale as `toUserRole`: same underlying string values, exhaustive
 * switch, no `as` cast.
 */
function toGovernanceFilter(governance: Governance): AdminUserGovernanceFilter {
  switch (governance) {
    case "Active":
      return AdminUserGovernanceFilter.Active;
    case "Suspended":
      return AdminUserGovernanceFilter.Suspended;
    case "Blocked":
      return AdminUserGovernanceFilter.Blocked;
    case "Deleted":
      return AdminUserGovernanceFilter.Deleted;
  }
  // Exhaustive-switch fallback — TypeScript knows `Governance` is fully
  // covered above, but `consistent-return` requires every code path to
  // return OR none. Return Active (the default governance for new
  // accounts) if a future Governance member lands here without a case
  // update.
  return AdminUserGovernanceFilter.Active;
}

interface AdminUsersDirectoryContainerProps {
  readonly labels: AdminUsersLabels;
}

const DEFAULT_PAGE_SIZE = 10;

export function AdminUsersDirectoryContainer({ labels }: AdminUsersDirectoryContainerProps): ReactNode {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [roleFilter, setRoleFilter] = useState<Role | "">("");
  const [governanceFilter, setGovernanceFilter] = useState<Governance | "">("");
  const [countryFilter, setCountryFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DirectoryUserListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DirectoryUserListItem | null>(null);
  const [snackbarMessage, setSnackbarMessage] = useState<string | null>(null);

  // Debounce search input (300ms).
  if (searchInput !== searchDebounced) {
    setTimeout(() => setSearchDebounced(searchInput), 300);
  }

  const variables: AdminUsersQueryVariables = {
    filters: {
      // Narrow the local `Role` / `Governance` string-literal unions to the
      // GraphQL-codegen `UserRole` / `AdminUserGovernanceFilter` enums via
      // the runtime-validated `toUserRole` / `toGovernanceFilter` helpers
      // (no `as unknown as ...` cast).
      role: roleFilter ? toUserRole(roleFilter) : null,
      governance: governanceFilter ? toGovernanceFilter(governanceFilter) : null,
      country: countryFilter || null,
      search: searchDebounced || null,
    },
    page: page + 1,
    pageSize,
  };

  const { data, loading, error } = useQuery(adminUsersQueryDocument, {
    variables,
    fetchPolicy: "cache-and-network",
  });

  // Every completed write re-fetches the directory page so the list stays
  // honest without a manual reload.
  const refetchAfterWrite = [{ query: adminUsersQueryDocument, variables }];

  const [createUser, { loading: createLoading }] = useMutation(adminCreateUserMutationDocument, {
    refetchQueries: refetchAfterWrite,
    awaitRefetchQueries: true,
  });
  const [updateUser, { loading: updateLoading }] = useMutation(adminUpdateUserMutationDocument, {
    refetchQueries: refetchAfterWrite,
    awaitRefetchQueries: true,
  });
  const [setDeleted, { loading: deleteLoading }] = useMutation(adminSetUserDeletedMutationDocument, {
    refetchQueries: refetchAfterWrite,
    awaitRefetchQueries: true,
  });

  const items = data?.adminUsers.items ?? [];
  const totalCount = data?.adminUsers.totalCount ?? 0;
  const firstErrorCode = error ? extractErrorCode(error) : null;
  const hasFilters = roleFilter !== "" || governanceFilter !== "" || countryFilter !== "" || searchDebounced !== "";

  return (
    <Stack spacing={3} sx={{ p: { xs: 2, md: 3 }, pb: { xs: 8, md: 4 } }}>
      <Typography variant="h4" component="h1">
        {labels.title}
      </Typography>

      <DirectoryToolbar
        labels={labels}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        governanceFilter={governanceFilter}
        setGovernanceFilter={setGovernanceFilter}
        countryFilter={countryFilter}
        setCountryFilter={setCountryFilter}
        searchInput={searchInput}
        setSearchInput={setSearchInput}
        onCreateUser={() => setCreateOpen(true)}
      />

      <FilterChipsRow
        labels={labels}
        roleFilter={roleFilter}
        governanceFilter={governanceFilter}
        setRoleFilter={setRoleFilter}
        setGovernanceFilter={setGovernanceFilter}
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
        hasFilters={hasFilters}
        onEdit={setEditTarget}
        onDelete={setDeleteTarget}
        pagination={
          <DirectoryPagination
            labels={labels}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={value => {
              setPageSize(value);
              setPage(0);
            }}
          />
        }
      />

      <MobileUserCardList
        labels={labels}
        items={items}
        loading={loading}
        hasFilters={hasFilters}
        onEdit={setEditTarget}
        onDelete={setDeleteTarget}
      />

      <Box sx={{ display: { xs: "block", md: "none" } }}>
        {/* Mobile pagination sits in its own card (same 12px radius /
            `border.light` outline as the user cards) so it doesn't float
            bare on the page background. */}
        <Card
          sx={theme => ({
            borderRadius: "12px",
            border: `1px solid ${theme.palette.border.light}`,
            boxShadow: theme.palette.shadow.card,
          })}
        >
          <DirectoryPagination
            labels={labels}
            page={page}
            pageSize={pageSize}
            totalCount={totalCount}
            onPageChange={setPage}
            onPageSizeChange={value => {
              setPageSize(value);
              setPage(0);
            }}
            borderedTop={false}
          />
        </Card>
      </Box>

      {/* Mobile-only create affordance — the desktop one lives in the
          toolbar. Fixed above the bottom nav (bottom: 88px), below dialogs. */}
      <Fab
        color="primary"
        aria-label={labels.createDialog.title}
        onClick={() => setCreateOpen(true)}
        sx={{ display: { xs: "flex", md: "none" }, position: "fixed", insetInlineEnd: 16, bottom: 88, zIndex: 900 }}
      >
        <AddIcon />
      </Fab>

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

      <AdminUserSuccessSnackbar message={snackbarMessage} onClose={() => setSnackbarMessage(null)} />
    </Stack>
  );
}

type DirectoryUserListItem = DirectoryUserItem;

/* CreateUserDialog lives in its own module (`CreateUserDialog.tsx`); the
 * edit / delete-confirm dialogs live in the shared AdminUserDialogs module
 * (also consumed by AdminUserDetailContainer for its inline header actions)
 * — see those files for the error-propagation contract. */
