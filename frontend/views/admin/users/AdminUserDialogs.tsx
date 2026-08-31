"use client";

/**
 * AdminUserDialogs — shared mutation dialogs for the admin user-management
 * surface.
 *
 * Used by BOTH the directory container (row-level actions in
 * `AdminUsersDirectoryContainer`) and the detail container (inline header
 * actions in `AdminUserDetailContainer`), so the edit / soft-delete /
 * reactivate UX is identical on both surfaces.
 *
 * Error-propagation contract (deliberate):
 *  - The caller's `onSubmit` / `onConfirm` MUST let rejections PROPAGATE —
 *    do NOT swallow them in a try/catch at the call site. The dialog's own
 *    submit/confirm handler catches the rejection and projects it:
 *      • VALIDATION field errors → inline `helperText` under the offending
 *        input (via `extractFieldErrors` on `extensions.fields`);
 *      • `USER_SELF_DEACTIVATION_FORBIDDEN` → the in-dialog warning alert
 *        (dialog stays open so the alert is visible);
 *      • any other code → the dialog simply stays open (the caller's UI
 *        state is unchanged; the admin can retry or cancel).
 *  - The dialog closes ONLY when the caller resolves — i.e. on success the
 *    caller flips its open-target state AFTER awaiting the mutation.
 *
 * All chrome copy comes from the `AdminUsers` locale namespace (passed from
 * the server as `labels`). MUI v9 `sx`-only discipline; `*Outlined` icons in
 * the callers; ≥44px touch targets on every button.
 */

import {
  CloseOutlined as CloseIcon,
  InfoOutlined as InfoIcon,
  CheckCircleOutlined as ReactivateIcon,
  WarningAmberOutlined as WarningIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  FormControl,
  FormHelperText,
  IconButton,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { type ReactNode, type SubmitEventHandler, useState } from "react";
import type { Gender } from "@/frontend/graphql/generated/gql/graphql";
import { extractErrorCode } from "@/frontend/lib/graphql-error-utils";
import { asDirectoryRole } from "@/frontend/views/admin/users/adminUsersDirectory.helpers";
import { DirectoryRolePill } from "@/frontend/views/admin/users/DirectoryRowCells";
import { useAdminUserFormFeedback } from "@/frontend/views/admin/users/useAdminUserFormFeedback";
import { useAppLocale } from "@/shared/locale";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

/**
 * Minimal shape `EditUserDialog` needs from its target user. Both the
 * directory list item (`AdminUserListItemFields` — gender + dateOfBirth were
 * added to the list fragment exactly for this purpose) and the detail
 * projection (`AdminUserDetailFields`) structurally satisfy this interface,
 * so the dialog is reusable from either surface without adapter objects.
 */
export interface AdminUserEditTarget {
  readonly id: number;
  readonly fullName: string;
  readonly phone: string | null;
  readonly country: string | null;
  readonly gender: Gender | null | undefined;
  readonly dateOfBirth: string | null | undefined;
}

/**
 * Minimal shape `DeleteConfirmDialog` needs from its target user. The
 * governance boolean decides whether the dialog presents soft-delete or
 * reactivate copy; `fullName` and `role` feed the personalized centered body
 * (bold name line + role pill inside the info callout). Both the directory
 * list item and the detail projection structurally satisfy this interface.
 */
export interface AdminUserDeleteTarget {
  readonly id: number;
  readonly fullName: string;
  readonly role: string;
  readonly isDeleted: boolean | null | undefined;
}

/** Whitelist patch payload the edit dialog hands back to its caller. */
export interface AdminEditUserPatchInput {
  readonly fullName?: string;
  readonly phone?: string;
  readonly country?: string;
  readonly gender?: "Male" | "Female" | "Other";
  readonly dateOfBirth?: string;
}

interface AdminDialogFieldLabelProps {
  readonly text: string;
  /** Targets the input element id (`label htmlFor`) — used for TextField fields. */
  readonly htmlFor?: string;
  /** Stable label-element id — consumed by the gender `Select labelId`. */
  readonly id?: string;
  /** Appends a `*` marker in `error.main` for required fields. */
  readonly required?: boolean;
}

/**
 * Above-the-field label shared by the create/edit dialogs — the prototype's
 * label pattern: a bold-ish text row ABOVE the control instead of MUI's
 * floating/notch InputLabel. Renders a real `<label>` when `htmlFor` is
 * supplied; the gender Select wires it via `labelId` instead.
 */
export function AdminDialogFieldLabel({ text, htmlFor, id, required = false }: AdminDialogFieldLabelProps): ReactNode {
  return (
    <Typography
      component="label"
      htmlFor={htmlFor}
      id={id}
      variant="body2"
      sx={theme => ({ display: "block", mb: 0.75, fontWeight: 600, color: theme.palette.text.primary })}
    >
      {text}
      {required && (
        // `marginInlineStart` (not a literal leading space) pins the asterisk
        // to the label's visual END under both directions — left of Arabic
        // labels (RTL) and right of Latin ones (LTR).
        <Box component="span" sx={theme => ({ marginInlineStart: 0.5, color: theme.palette.error.main })}>
          {"*"}
        </Box>
      )}
    </Typography>
  );
}

interface EditDialogProps {
  readonly labels: AdminUsersLabels;
  readonly user: AdminUserEditTarget;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: AdminEditUserPatchInput) => Promise<void>;
}

interface AdminDialogHeaderBandProps {
  readonly title: string;
  readonly subtitle: string;
  /** Accessible label for the trailing close icon button. */
  readonly closeLabel: string;
  readonly loading: boolean;
  readonly onClose: () => void;
}

/**
 * Dialog header band shared by the create/edit dialogs — title + subtitle on
 * the start side, trailing close affordance, bottom hairline. Rendered on
 * `background.paper` so it contrasts against the tinted body band.
 */
export function AdminDialogHeaderBand({
  title,
  subtitle,
  closeLabel,
  loading,
  onClose,
}: AdminDialogHeaderBandProps): ReactNode {
  return (
    <Box
      sx={theme => ({
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 2,
        px: { xs: 2.5, sm: 3 },
        pt: { xs: 2.5, sm: 3 },
        pb: 2,
        backgroundColor: theme.palette.background.paper,
        // `border.main` (vs `.light`) keeps the band hairline readable against
        // the tinted body band (`surfaceContainer` light / `surfaceContainerLowest`
        // dark).
        borderBottom: `1px solid ${theme.palette.border.main}`,
      })}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h6" component="h2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Typography variant="body2" sx={theme => ({ mt: 0.5, color: theme.palette.text.secondary })}>
          {subtitle}
        </Typography>
      </Box>
      <IconButton aria-label={closeLabel} onClick={onClose} disabled={loading} size="small" sx={{ mt: -0.5 }}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  );
}

interface AdminDialogFooterBandProps {
  readonly cancelLabel: string;
  readonly submitLabel: string;
  readonly loading: boolean;
  readonly onClose: () => void;
}

/**
 * Dialog footer band shared by the create/edit dialogs — Cancel (text) +
 * submit (contained primary, form submit) end-aligned (the flex direction
 * flips automatically under RTL), top hairline, paper background. The parent
 * `<form>` supplies the submit behavior, so this band renders no form logic.
 */
export function AdminDialogFooterBand({
  cancelLabel,
  submitLabel,
  loading,
  onClose,
}: AdminDialogFooterBandProps): ReactNode {
  return (
    <DialogActions
      sx={theme => ({
        px: { xs: 2.5, sm: 3 },
        py: 2,
        gap: 1,
        justifyContent: "flex-end",
        backgroundColor: theme.palette.background.paper,
        borderTop: `1px solid ${theme.palette.border.main}`,
      })}
    >
      <Button
        onClick={onClose}
        disabled={loading}
        sx={theme => ({
          minHeight: 44,
          color: theme.palette.text.secondary,
          "&:hover": { backgroundColor: theme.palette.action.hover },
        })}
      >
        {cancelLabel}
      </Button>
      <Button type="submit" variant="contained" disabled={loading} sx={{ minHeight: 44 }}>
        {submitLabel}
      </Button>
    </DialogActions>
  );
}

export function EditUserDialog({ labels, user, loading, onClose, onSubmit }: EditDialogProps): ReactNode {
  const EDIT_NAME_ID = "admin-users-edit-fullname";
  const EDIT_PHONE_ID = "admin-users-edit-phone";
  const EDIT_COUNTRY_ID = "admin-users-edit-country";
  const EDIT_GENDER_ID = "admin-users-edit-gender";
  const EDIT_DOB_ID = "admin-users-edit-dob";
  const locale = useAppLocale();
  const [form, setForm] = useState({
    fullName: user.fullName,
    phone: user.phone ?? "",
    country: user.country ?? "",
    // Pre-fill gender + dateOfBirth from the target row so admins see the
    // current value when patching. The list fragment carries these two safe
    // `users` columns to avoid a second round-trip to the detail endpoint.
    // `null` / `undefined` map to the empty select value.
    gender: (user.gender ?? "") as "" | "Male" | "Female" | "Other",
    dateOfBirth: user.dateOfBirth ?? "",
  });
  const { fieldErrors, formError, runWithFeedback } = useAdminUserFormFeedback();

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async e => {
    e.preventDefault();
    await runWithFeedback(() =>
      onSubmit({
        fullName: form.fullName || undefined,
        phone: form.phone || undefined,
        country: form.country || undefined,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
      })
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { borderRadius: "16px", overflow: "hidden" } } }}
    >
      <form onSubmit={handleSubmit}>
        <AdminDialogHeaderBand
          title={labels.editDialog.title}
          subtitle={labels.editDialog.subtitle}
          closeLabel={labels.editDialog.cancel}
          loading={loading}
          onClose={onClose}
        />
        <DialogContent
          sx={theme => ({
            px: { xs: 2.5, sm: 3 },
            py: 3,
            // Dark drops to `surfaceContainerLowest`: `background.paper` and
            // the low ladder steps share the same hue family in the dark
            // palette, so the header/footer vs body banding needs the extra
            // ladder step to stay visible. Light uses `surfaceContainer` —
            // the `--Low` step was too close to `background.paper` for the
            // banding to read.
            backgroundColor:
              theme.palette.mode === "dark" ? theme.palette.surfaceContainerLowest : theme.palette.surfaceContainer,
          })}
        >
          <Stack spacing={2}>
            {formError && <Alert severity="error">{formError}</Alert>}
            <Box>
              <AdminDialogFieldLabel htmlFor={EDIT_NAME_ID} text={labels.editDialog.fullName} />
              <TextField
                id={EDIT_NAME_ID}
                fullWidth
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                error={!!fieldErrors.fullName}
                helperText={fieldErrors.fullName}
                aria-invalid={!!fieldErrors.fullName}
              />
            </Box>
            <Box>
              <AdminDialogFieldLabel htmlFor={EDIT_PHONE_ID} text={labels.editDialog.phone} />
              <TextField
                id={EDIT_PHONE_ID}
                fullWidth
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                error={!!fieldErrors.phone}
                helperText={fieldErrors.phone}
                aria-invalid={!!fieldErrors.phone}
                slotProps={{ htmlInput: { dir: "ltr" } }}
              />
            </Box>
            <Box>
              <AdminDialogFieldLabel htmlFor={EDIT_COUNTRY_ID} text={labels.editDialog.country} />
              <TextField
                id={EDIT_COUNTRY_ID}
                fullWidth
                value={form.country}
                onChange={e => setForm({ ...form, country: e.target.value })}
                error={!!fieldErrors.country}
                helperText={fieldErrors.country}
                aria-invalid={!!fieldErrors.country}
              />
            </Box>
            <AdminUserGenderSelect
              labels={labels}
              id={EDIT_GENDER_ID}
              label={labels.editDialog.gender}
              value={form.gender}
              onChange={gender => setForm({ ...form, gender })}
              error={fieldErrors.gender}
            />
            <Box>
              <AdminDialogFieldLabel htmlFor={EDIT_DOB_ID} text={labels.editDialog.dateOfBirth} />
              <TextField
                id={EDIT_DOB_ID}
                type="date"
                fullWidth
                value={form.dateOfBirth}
                onChange={e => setForm({ ...form, dateOfBirth: e.target.value })}
                // `lang` on the native date input localizes the browser's
                // built-in placeholder (the English `mm/dd/yyyy` mask) to the
                // active UI locale instead of always rendering English.
                slotProps={{ htmlInput: { lang: locale } }}
                error={!!fieldErrors.dateOfBirth}
                helperText={fieldErrors.dateOfBirth}
                aria-invalid={!!fieldErrors.dateOfBirth}
              />
            </Box>
          </Stack>
        </DialogContent>
        <AdminDialogFooterBand
          cancelLabel={labels.editDialog.cancel}
          submitLabel={labels.editDialog.submit}
          loading={loading}
          onClose={onClose}
        />
      </form>
    </Dialog>
  );
}

interface DeleteDialogProps {
  readonly labels: AdminUsersLabels;
  readonly user: AdminUserDeleteTarget;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}

export function DeleteConfirmDialog({ labels, user, loading, onClose, onConfirm }: DeleteDialogProps): ReactNode {
  const isReactivate = user.isDeleted ?? false;
  const [selfDeactivationAlert, setSelfDeactivationAlert] = useState(false);

  const handleConfirm = async () => {
    setSelfDeactivationAlert(false);
    try {
      await onConfirm();
    } catch (err) {
      // `err` is `unknown` in a catch block (strict mode) — no `as unknown`
      // cast needed before passing to the error-code extractor.
      const code = extractErrorCode(err);
      if (code === "USER_SELF_DEACTIVATION_FORBIDDEN") {
        setSelfDeactivationAlert(true);
      }
    }
  };

  // Centered prototype composition: halo icon + title + bold-name body +
  // info callout. Deactivate uses the `error` family; reactivate reuses the
  // same structure with the `success` family (its namespace carries no
  // consequences/roleNote copy, so those lines render only for deactivation).
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" slotProps={{ paper: { sx: { borderRadius: "16px" } } }}>
      <DialogContent sx={{ px: 3, pt: 3, pb: 1 }}>
        {selfDeactivationAlert && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {labels.selfDeactivationAlert.message}
          </Alert>
        )}
        {/* Vertical rhythm: halo → +16 → title → +8 → name → +12 → body →
            +16 → callout. The actions row adds +24px (content pb 1 + actions
            pt 2) after the callout. */}
        <Stack spacing={0} sx={{ alignItems: "center", textAlign: "center" }}>
          <Box
            sx={theme => ({
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 64,
              height: 64,
              borderRadius: "50%",
              backgroundColor: isReactivate ? theme.palette.successContainer : theme.palette.errorContainer,
            })}
          >
            {isReactivate ? (
              <ReactivateIcon sx={theme => ({ fontSize: 32, color: theme.palette.success.main })} />
            ) : (
              <WarningIcon sx={theme => ({ fontSize: 32, color: theme.palette.error.main })} />
            )}
          </Box>
          <Typography variant="h6" component="h2" sx={{ mt: 2, fontWeight: 700 }}>
            {isReactivate ? labels.reactivateConfirm.title : labels.deleteConfirm.title}
          </Typography>
          <Typography variant="body1" sx={{ mt: 1, fontWeight: 700, overflowWrap: "anywhere" }}>
            {user.fullName}
          </Typography>
          <Typography variant="body2" sx={theme => ({ mt: 1.5, color: theme.palette.text.secondary })}>
            {isReactivate ? labels.reactivateConfirm.message : labels.deleteConfirm.message}
          </Typography>
          {!isReactivate && (
            <Typography variant="body2" sx={theme => ({ mt: 1, color: theme.palette.text.secondary })}>
              {labels.deleteConfirm.consequences}
            </Typography>
          )}
          {!isReactivate && (
            <Box
              sx={theme => ({
                display: "flex",
                alignItems: "center",
                alignSelf: "stretch",
                // Inner rhythm after the 4px accent bar: `p: 1.5` puts 12px
                // between bar and icon; `gap: 1` keeps the icon→text and
                // (via the row Stack below) text→chip spacing at 8px.
                gap: 1,
                mt: 2,
                p: 1.5,
                borderRadius: "8px",
                textAlign: "start",
                backgroundColor: theme.palette.surfaceContainerHigh,
                borderInlineStart: `4px solid ${theme.palette.info.main}`,
              })}
            >
              <InfoIcon sx={theme => ({ fontSize: 20, color: theme.palette.info.main })} />
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", rowGap: 0.5 }}>
                <Typography variant="body2" sx={theme => ({ color: theme.palette.onSurface })}>
                  {labels.deleteConfirm.roleNote}
                </Typography>
                <DirectoryRolePill role={asDirectoryRole(user.role)} labels={labels} />
              </Stack>
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions
        sx={theme => ({
          px: 3,
          pb: 3,
          pt: 2,
          gap: 1.5,
          justifyContent: "flex-end",
          alignItems: "center",
          // Same `border.main` hairline as `AdminDialogFooterBand` so all
          // three dialogs share the banded footer rhythm. One DialogActions
          // serves both deactivate and reactivate, so there is exactly one
          // hairline — no double border.
          borderTop: `1px solid ${theme.palette.border.main}`,
        })}
      >
        <Button
          onClick={onClose}
          disabled={loading}
          sx={theme => ({
            minHeight: 44,
            color: theme.palette.text.secondary,
            "&:hover": { backgroundColor: theme.palette.action.hover },
          })}
        >
          {isReactivate ? labels.reactivateConfirm.cancel : labels.deleteConfirm.cancel}
        </Button>
        <Button
          onClick={handleConfirm}
          color={isReactivate ? "success" : "error"}
          variant="contained"
          disabled={loading}
          sx={{ minHeight: 44, minWidth: 140 }}
        >
          {isReactivate ? labels.reactivateConfirm.confirm : labels.deleteConfirm.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Gender option values shared by the create- and edit-user dialogs. */
type AdminUserGenderValue = "" | "Male" | "Female" | "Other";

interface AdminUserGenderSelectProps {
  readonly labels: AdminUsersLabels;
  /** Stable element id wiring `labelId` on the Select ↔ label row (a11y). */
  readonly id: string;
  /** Visible label — the caller picks its own namespace block
   *  (`editDialog.gender` vs `createDialog.gender`). */
  readonly label: string;
  readonly value: AdminUserGenderValue;
  readonly onChange: (value: AdminUserGenderValue) => void;
  /**
   * Field-error string, `undefined` when the field has no VALIDATION error.
   * The create dialog always passes `undefined` (its gender select renders
   * without the error affordance); the edit dialog projects
   * `fieldErrors.gender` (red select + message below it), so the two
   * dialogs' pre-extraction behavior is preserved exactly.
   */
  readonly error: string | undefined;
}

/**
 * Gender select shared by `EditUserDialog` (here) and the directory's
 * `CreateUserDialog` — identical option set, option copy, and label wiring
 * on both surfaces (single source for the four `genderOptions` MenuItems).
 * The label renders above the field via `AdminDialogFieldLabel` (prototype
 * label pattern) and is wired to the Select through `labelId`.
 * `Select`'s generic is pinned by the `value` prop type, so
 * `e.target.value` arrives already typed as `AdminUserGenderValue` — no
 * `as` cast at the caller. `displayEmpty` + `renderValue` give the empty
 * state a placeholder (the field label text in `text.secondary`) instead
 * of a blank box; the required asterisk stays on the label above.
 */
export function AdminUserGenderSelect({
  labels,
  id,
  label,
  value,
  onChange,
  error,
}: AdminUserGenderSelectProps): ReactNode {
  // Value → option-text lookup for `renderValue`; keeps the rendered text in
  // sync with the MenuItems below without re-reading the DOM.
  const optionLabels: Record<AdminUserGenderValue, string> = {
    "": labels.genderOptions.unspecified,
    Male: labels.genderOptions.male,
    Female: labels.genderOptions.female,
    Other: labels.genderOptions.other,
  };
  return (
    <FormControl fullWidth error={!!error}>
      <AdminDialogFieldLabel id={`${id}-label`} text={label} />
      <Select
        id={id}
        labelId={`${id}-label`}
        value={value}
        onChange={e => onChange(e.target.value)}
        // `displayEmpty` + `renderValue`: an empty selection renders the field
        // label text in `text.secondary` as the placeholder instead of a bare
        // empty box; the required-marker semantics stay on the label above.
        displayEmpty
        // `selected`'s inferred type excludes the empty string (MUI infers
        // the non-empty option union), so pin it to `AdminUserGenderValue`
        // to keep the legit runtime `""` comparison typeable.
        renderValue={(selected: AdminUserGenderValue) =>
          selected === "" ? (
            <Box component="span" sx={theme => ({ color: theme.palette.text.secondary })}>
              {label}
            </Box>
          ) : (
            optionLabels[selected]
          )
        }
      >
        <MenuItem value="">{labels.genderOptions.unspecified}</MenuItem>
        <MenuItem value="Male">{labels.genderOptions.male}</MenuItem>
        <MenuItem value="Female">{labels.genderOptions.female}</MenuItem>
        <MenuItem value="Other">{labels.genderOptions.other}</MenuItem>
      </Select>
      {error && <FormHelperText>{error}</FormHelperText>}
    </FormControl>
  );
}

interface AdminUserSuccessSnackbarProps {
  /** `null` keeps the snackbar closed; any string renders it. */
  readonly message: string | null;
  readonly onClose: () => void;
}

/**
 * Success-feedback snackbar shared by the directory and the detail
 * containers — identical open/close semantics (4s auto-hide, bottom-center
 * anchor, filled success alert with an explicit close affordance) after
 * every completed admin write (create / update / soft-delete / reactivate /
 * clipboard copy).
 */
export function AdminUserSuccessSnackbar({ message, onClose }: AdminUserSuccessSnackbarProps): ReactNode {
  return (
    <Snackbar
      open={message !== null}
      autoHideDuration={4000}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert severity="success" variant="filled" onClose={onClose}>
        {message}
      </Alert>
    </Snackbar>
  );
}
