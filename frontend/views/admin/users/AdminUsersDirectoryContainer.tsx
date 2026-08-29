"use client";

/**
 * AdminUsersDirectoryContainer — the admin user directory client surface.
 *
 * Composes:
 *  - filter bar (role, governance, country, debounced search)
 *  - paginated user table with role-child status chips
 *  - create dialog (whitelist input + VALIDATION field-error projection)
 *  - edit dialog (whitelist patch)
 *  - delete/reactivate confirm dialog with self-deactivation conflict alert
 *
 * All chrome copy comes from the `AdminUsers` locale namespace (passed from
 * the server as `labels`). MUI v9 `sx`-only discipline; colors via
 * `theme.palette.*` callbacks; `*Outlined` icons; ≥44px touch targets;
 * responsive (table ≥768px, stacked cards at 375px).
 */

import { useMutation, useQuery } from "@apollo/client/react";
import {
  AddOutlined as AddIcon,
  DeleteOutlineOutlined as DeleteIcon,
  EditOutlined as EditIcon,
  PersonOutlineOutlined as PersonIcon,
  RefreshOutlined as RefreshIcon,
  SearchOutlined as SearchIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Skeleton,
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
import { useState, type FormEvent, type ReactNode } from "react";
import {
  adminCreateUserMutationDocument,
  adminSetUserDeletedMutationDocument,
  adminUpdateUserMutationDocument,
  adminUsersQueryDocument,
} from "@/frontend/graphql/sharedDocuments/admin";
import { extractErrorCode, extractFieldErrors } from "@/frontend/lib/graphql-error-utils";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";
import type {
  AdminCreateUserMutation,
  AdminSetUserDeletedMutation,
  AdminUpdateUserMutation,
  AdminUserGovernanceFilter,
  AdminUsersQuery,
  AdminUsersQueryVariables,
  UserRole,
} from "@/frontend/graphql/generated/gql/graphql";

type AdminUserListItem = AdminUsersQuery["adminUsers"]["items"][number];
type Role = "Admin" | "Teacher" | "Student" | "Parent";
type Governance = "Active" | "Suspended" | "Blocked" | "Deleted";

interface AdminUsersDirectoryContainerProps {
  readonly labels: AdminUsersLabels;
}

const DEFAULT_PAGE_SIZE = 25;

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

  const [createUser, { loading: createLoading }] = useMutation<AdminCreateUserMutation>(
    adminCreateUserMutationDocument,
    { refetchQueries: [{ query: adminUsersQueryDocument, variables }], awaitRefetchQueries: true }
  );
  const [updateUser, { loading: updateLoading }] = useMutation<AdminUpdateUserMutation>(
    adminUpdateUserMutationDocument,
    { refetchQueries: [{ query: adminUsersQueryDocument, variables }], awaitRefetchQueries: true }
  );
  const [setDeleted, { loading: deleteLoading }] = useMutation<AdminSetUserDeletedMutation>(
    adminSetUserDeletedMutationDocument,
    { refetchQueries: [{ query: adminUsersQueryDocument, variables }], awaitRefetchQueries: true }
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
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          sx={{ minHeight: 44 }}
        >
          {labels.createDialog.title}
        </Button>
      </Box>

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
            try {
              await createUser({ variables: { input } });
              setCreateOpen(false);
            } catch {
              // Error surfaces via the form's field-error projection.
            }
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
            try {
              await updateUser({ variables: { id: editTarget.id, input } });
              setEditTarget(null);
            } catch {
              // Error surfaces via the form's field-error projection.
            }
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
            try {
              await setDeleted({ variables: { id: deleteTarget.id, deleted: !deleteTarget.isDeleted } });
              setDeleteTarget(null);
            } catch (err) {
              // Self-deactivation conflict stays open to show the alert.
              const code = extractErrorCode(err as unknown);
              if (code === "USER_SELF_DEACTIVATION_FORBIDDEN") {
                // keep dialog open — the alert renders below
              } else {
                setDeleteTarget(null);
              }
            }
          }}
        />
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
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ flexWrap: "wrap" }}>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>{labels.filters.role}</InputLabel>
            <Select
              value={props.roleFilter}
              label={labels.filters.role}
              onChange={e => props.setRoleFilter((e.target.value || "") as Role | "")}
            >
              <MenuItem value="">—</MenuItem>
              <MenuItem value="Admin">{labels.roleLabels.admin}</MenuItem>
              <MenuItem value="Teacher">{labels.roleLabels.teacher}</MenuItem>
              <MenuItem value="Student">{labels.roleLabels.student}</MenuItem>
              <MenuItem value="Parent">{labels.roleLabels.parent}</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>{labels.filters.governance}</InputLabel>
            <Select
              value={props.governanceFilter}
              label={labels.filters.governance}
              onChange={e => props.setGovernanceFilter((e.target.value || "") as Governance | "")}
            >
              <MenuItem value="">—</MenuItem>
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
            slotProps={{ input: { startAdornment: <SearchIcon fontSize="small" sx={{ mr: 1, color: "text.secondary" }} /> } }}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

interface DirectoryTableProps {
  readonly labels: AdminUsersLabels;
  readonly items: readonly AdminUserListItem[];
  readonly loading: boolean;
  readonly onEdit: (user: AdminUserListItem) => void;
  readonly onDelete: (user: AdminUserListItem) => void;
}

function DirectoryTable(props: DirectoryTableProps): ReactNode {
  const { labels, items, loading, onEdit, onDelete } = props;
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
            ? Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton variant="text" />
                  </TableCell>
                </TableRow>
              ))
            : items.map(u => (
                <TableRow key={u.id} hover>
                  <TableCell>{u.fullName}</TableCell>
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
                  <Typography color="text.secondary">{labels.emptyState.message}</Typography>
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
                  <Typography variant="subtitle2">{u.fullName}</Typography>
                  <StatusChip user={u} labels={labels} />
                </Box>
                <Typography variant="body2" color="text.secondary">{u.email}</Typography>
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
  const color = role === "Admin" ? "error" : role === "Teacher" ? "secondary" : role === "Student" ? "primary" : "default";
  const label = role === "Admin" ? labels.roleLabels.admin : role === "Teacher" ? labels.roleLabels.teacher : role === "Student" ? labels.roleLabels.student : labels.roleLabels.parent;
  return <Chip size="small" color={color as "error" | "secondary" | "primary" | "default"} label={label} variant="outlined" />;
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

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFieldErrors({});
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
      if (Object.keys(errors).length > 0) setFieldErrors(errors);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{labels.createDialog.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
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
            />
            <TextField
              label={labels.createDialog.password}
              type="password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              required
            />
            <FormControl fullWidth>
              <InputLabel>{labels.createDialog.gender}</InputLabel>
              <Select
                value={form.gender}
                label={labels.createDialog.gender}
                onChange={e => setForm({ ...form, gender: e.target.value as "" | "Male" | "Female" | "Other" })}
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label={labels.createDialog.country}
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
              required
            />
            <FormControl fullWidth>
              <InputLabel>{labels.createDialog.role}</InputLabel>
              <Select
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
          <Button onClick={onClose} disabled={loading}>
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

interface EditDialogProps {
  readonly labels: AdminUsersLabels;
  readonly user: AdminUserListItem;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: {
    readonly fullName?: string;
    readonly phone?: string;
    readonly country?: string;
    readonly gender?: "Male" | "Female" | "Other";
    readonly dateOfBirth?: string;
  }) => Promise<void>;
}

function EditUserDialog({ labels, user, loading, onClose, onSubmit }: EditDialogProps): ReactNode {
  const [form, setForm] = useState({
    fullName: user.fullName,
    phone: user.phone ?? "",
    country: user.country ?? "",
    gender: "" as "" | "Male" | "Female" | "Other",
    dateOfBirth: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFieldErrors({});
    try {
      await onSubmit({
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
        country: form.country || undefined,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      });
    } catch (err) {
      const errors = extractFieldErrors(err as unknown);
      if (Object.keys(errors).length > 0) setFieldErrors(errors);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{labels.editDialog.title}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label={labels.editDialog.fullName}
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              error={!!fieldErrors.fullName}
              helperText={fieldErrors.fullName}
            />
            <TextField
              label={labels.editDialog.phone}
              value={form.phone}
              onChange={e => setForm({ ...form, phone: e.target.value })}
            />
            <TextField
              label={labels.editDialog.country}
              value={form.country}
              onChange={e => setForm({ ...form, country: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel>{labels.editDialog.gender}</InputLabel>
              <Select
                value={form.gender}
                label={labels.editDialog.gender}
                onChange={e => setForm({ ...form, gender: e.target.value as "" | "Male" | "Female" | "Other" })}
              >
                <MenuItem value="">—</MenuItem>
                <MenuItem value="Male">Male</MenuItem>
                <MenuItem value="Female">Female</MenuItem>
                <MenuItem value="Other">Other</MenuItem>
              </Select>
            </FormControl>
            <TextField
              label={labels.editDialog.dateOfBirth}
              type="date"
              value={form.dateOfBirth}
              onChange={e => setForm({ ...form, dateOfBirth: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={onClose} disabled={loading}>
            {labels.editDialog.cancel}
          </Button>
          <Button type="submit" variant="contained" disabled={loading} sx={{ minHeight: 44 }}>
            {labels.editDialog.submit}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

interface DeleteDialogProps {
  readonly labels: AdminUsersLabels;
  readonly user: AdminUserListItem;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}

function DeleteConfirmDialog({ labels, user, loading, onClose, onConfirm }: DeleteDialogProps): ReactNode {
  const isReactivate = user.isDeleted;
  const [selfDeactivationAlert, setSelfDeactivationAlert] = useState(false);

  const handleConfirm = async () => {
    setSelfDeactivationAlert(false);
    try {
      await onConfirm();
    } catch (err) {
      const code = extractErrorCode(err as unknown);
      if (code === "USER_SELF_DEACTIVATION_FORBIDDEN") {
        setSelfDeactivationAlert(true);
      }
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{isReactivate ? labels.reactivateConfirm.title : labels.deleteConfirm.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {selfDeactivationAlert && (
            <Alert severity="warning">
              {labels.selfDeactivationAlert.message}
            </Alert>
          )}
          <Typography>
            {isReactivate ? labels.reactivateConfirm.message : labels.deleteConfirm.message}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {isReactivate ? labels.reactivateConfirm.confirm : labels.deleteConfirm.consequences}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          {isReactivate ? labels.reactivateConfirm.cancel : labels.deleteConfirm.cancel}
        </Button>
        <Button
          onClick={handleConfirm}
          color={isReactivate ? "success" : "error"}
          variant="contained"
          disabled={loading}
          sx={{ minHeight: 44 }}
        >
          {isReactivate ? labels.reactivateConfirm.confirm : labels.deleteConfirm.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
