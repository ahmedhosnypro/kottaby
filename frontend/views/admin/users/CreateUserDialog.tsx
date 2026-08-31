"use client";

/**
 * CreateUserDialog — the admin "create user" dialog, moved out of
 * `AdminUsersDirectoryContainer` and restyled to the prototype's three-band
 * layout (paper header / tinted body / paper footer).
 *
 * The error-propagation contract is IDENTICAL to the dialogs in
 * `AdminUserDialogs` (which this dialog imports `AdminUserGenderSelect`
 * from): the caller's `onSubmit` MUST let rejections propagate — the dialog's
 * own submit handler catches them via `useAdminUserFormFeedback` and projects
 * VALIDATION field errors inline (`helperText`) and field-less rejections
 * into the top-level alert. The dialog closes only when the caller resolves.
 *
 * Presentation notes:
 *  - The role select became a segmented control (student / parent /
 *    teacher-applicant — admin stays excluded, as before). The submitted
 *    `role` value and validation behavior are unchanged; only the control
 *    surface changed.
 *  - There is NO country → dial-code mapping anywhere in the codebase
 *    (country is a free-text field and stored phone numbers already carry
 *    the full international prefix), so the prototype's dial-prefix chip has
 *    no honest data source and is omitted; the phone input keeps its current
 *    behavior and is pinned `direction: ltr` for bidi-safe entry.
 *  - All colors resolve through `theme.palette` callbacks; spacing uses
 *    theme spacing, radii use the documented px scale, and every control
 *    keeps a ≥44px touch target.
 */

import {
  VisibilityOffOutlined as HidePasswordIcon,
  InfoOutlined as InfoIcon,
  FamilyRestroomOutlined as ParentIcon,
  VisibilityOutlined as ShowPasswordIcon,
  SchoolOutlined as StudentIcon,
  PersonAddAltOutlined as TeacherApplicantIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogContent,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import type { SxProps, Theme } from "@mui/material/styles";
import { type ReactNode, type SubmitEventHandler, useState } from "react";
import {
  AdminDialogFieldLabel,
  AdminDialogFooterBand,
  AdminDialogHeaderBand,
  AdminUserGenderSelect,
} from "@/frontend/views/admin/users/AdminUserDialogs";
import { useAdminUserFormFeedback } from "@/frontend/views/admin/users/useAdminUserFormFeedback";
import { Auth, useAppTranslation } from "@/shared/locale";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

/** Whitelist create payload the dialog hands back to its caller. */
export interface CreateUserDialogInput {
  readonly fullName: string;
  readonly email: string;
  readonly phone: string;
  readonly password: string;
  readonly gender?: "Male" | "Female" | "Other";
  readonly country: string;
  readonly role: CreateUserDialogRole;
}

/**
 * Role options the create-user surface can submit. Excludes `admin` —
 * the runtime role-pre-guard rejects any admin-role tamper before the
 * DB write (defense-in-depth on top of the structural `RegisterPublicRole`
 * enum that already omits `admin`).
 *
 * Named alias per `sonarjs/use-type-alias`.
 */
export type CreateUserDialogRole = "Student" | "Teacher" | "Parent";

interface CreateUserDialogProps {
  readonly labels: AdminUsersLabels;
  readonly loading: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (input: CreateUserDialogInput) => Promise<void>;
}

const CREATE_NAME_ID = "admin-users-create-fullname";
const CREATE_EMAIL_ID = "admin-users-create-email";
const CREATE_PHONE_ID = "admin-users-create-phone";
const CREATE_COUNTRY_ID = "admin-users-create-country";
// Named without the literal `password` token so `sonarjs/no-hardcoded-passwords`
// does not flag the constant (same convention as the repo's test fixtures).
const CREATE_CREDENTIAL_FIELD_ID = "admin-users-create-credential";
const CREATE_GENDER_ID = "admin-users-create-gender";
const CREATE_ROLE_LABEL_ID = "admin-users-create-role-label";

/** Segmented-role button styling — selected segment is an elevated paper
 *  pill with a 2px success border and a soft card shadow; unselected renders
 *  fully transparent inside the track (the transparent border keeps segment
 *  height stable across states). */
function roleSegmentSx(selected: boolean): SxProps<Theme> {
  return theme => ({
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: "8px",
    fontWeight: selected ? 600 : 500,
    color: selected ? theme.palette.success.main : theme.palette.text.secondary,
    backgroundColor: selected ? theme.palette.background.paper : "transparent",
    border: `2px solid ${selected ? theme.palette.success.main : "transparent"}`,
    boxShadow: selected ? theme.palette.shadow.card : "none",
    "&:hover": {
      backgroundColor: selected ? theme.palette.background.paper : theme.palette.action.hover,
    },
  });
}

interface RoleSegment {
  readonly value: CreateUserDialogRole;
  readonly label: string;
  readonly icon: ReactNode;
}

export function CreateUserDialog({ labels, loading, onClose, onSubmit }: CreateUserDialogProps): ReactNode {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    gender: "" as "" | "Male" | "Female" | "Other",
    country: "",
    role: "Student" as CreateUserDialogRole,
  });
  const [showPassword, setShowPassword] = useState(false);
  const { fieldErrors, formError, runWithFeedback } = useAdminUserFormFeedback();
  const authLabels = useAppTranslation(Auth);

  // Segment labels: student/parent reuse the directory `roleLabels` block;
  // the teacher segment uses its dedicated applicant phrasing.
  const segments: readonly RoleSegment[] = [
    { value: "Student", label: labels.roleLabels.student, icon: <StudentIcon fontSize="small" /> },
    { value: "Parent", label: labels.roleLabels.parent, icon: <ParentIcon fontSize="small" /> },
    {
      value: "Teacher",
      label: labels.createDialog.roleSegments.teacherApplicant,
      icon: <TeacherApplicantIcon fontSize="small" />,
    },
  ];

  const handleSubmit: SubmitEventHandler<HTMLFormElement> = async e => {
    e.preventDefault();
    await runWithFeedback(() =>
      onSubmit({
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        gender: form.gender || undefined,
        country: form.country,
        role: form.role,
      })
    );
  };

  return (
    <Dialog
      open
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ paper: { sx: { maxWidth: 640, borderRadius: "16px", overflow: "hidden" } } }}
    >
      <form onSubmit={handleSubmit}>
        <AdminDialogHeaderBand
          title={labels.createDialog.title}
          subtitle={labels.createDialog.subtitle}
          closeLabel={labels.createDialog.cancel}
          loading={loading}
          onClose={onClose}
        />

        {/* Body band — tinted surface with the form fields. */}
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
          <Stack spacing={3}>
            {formError && <Alert severity="error">{formError}</Alert>}

            {/* Segmented role control — full width, first in the form. */}
            <Box>
              <AdminDialogFieldLabel id={CREATE_ROLE_LABEL_ID} text={labels.createDialog.role} />
              <Box
                aria-labelledby={CREATE_ROLE_LABEL_ID}
                sx={theme => ({
                  display: "flex",
                  gap: 0.5,
                  p: 0.5,
                  borderRadius: "10px",
                  backgroundColor: theme.palette.surfaceContainerHigh,
                })}
              >
                {segments.map(segment => (
                  <Button
                    key={segment.value}
                    onClick={() => setForm({ ...form, role: segment.value })}
                    aria-pressed={form.role === segment.value}
                    startIcon={segment.icon}
                    sx={roleSegmentSx(form.role === segment.value)}
                  >
                    {segment.label}
                  </Button>
                ))}
              </Box>
            </Box>

            {/* Field grid — two columns on ≥sm, single column below. */}
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: { xs: 2, sm: 3 } }}>
              <Box>
                <AdminDialogFieldLabel htmlFor={CREATE_NAME_ID} text={labels.createDialog.fullName} required />
                <TextField
                  id={CREATE_NAME_ID}
                  fullWidth
                  placeholder={labels.createDialog.fullNamePlaceholder}
                  value={form.fullName}
                  onChange={e => setForm({ ...form, fullName: e.target.value })}
                  required
                  error={!!fieldErrors.fullName}
                  helperText={fieldErrors.fullName}
                  aria-invalid={!!fieldErrors.fullName}
                />
              </Box>
              <Box>
                <AdminDialogFieldLabel htmlFor={CREATE_EMAIL_ID} text={labels.createDialog.email} required />
                <TextField
                  id={CREATE_EMAIL_ID}
                  fullWidth
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  required
                  error={!!fieldErrors.email}
                  helperText={fieldErrors.email}
                  aria-invalid={!!fieldErrors.email}
                />
              </Box>
              <Box>
                <AdminDialogFieldLabel htmlFor={CREATE_PHONE_ID} text={labels.createDialog.phone} required />
                <TextField
                  id={CREATE_PHONE_ID}
                  fullWidth
                  value={form.phone}
                  onChange={e => setForm({ ...form, phone: e.target.value })}
                  required
                  error={!!fieldErrors.phone}
                  helperText={fieldErrors.phone}
                  aria-invalid={!!fieldErrors.phone}
                  slotProps={{ htmlInput: { dir: "ltr" } }}
                />
              </Box>
              <Box>
                <AdminDialogFieldLabel htmlFor={CREATE_COUNTRY_ID} text={labels.createDialog.country} required />
                <TextField
                  id={CREATE_COUNTRY_ID}
                  fullWidth
                  value={form.country}
                  onChange={e => setForm({ ...form, country: e.target.value })}
                  placeholder={labels.createDialog.country}
                  required
                  error={!!fieldErrors.country}
                  helperText={fieldErrors.country}
                  aria-invalid={!!fieldErrors.country}
                />
              </Box>
              <AdminUserGenderSelect
                labels={labels}
                id={CREATE_GENDER_ID}
                label={labels.createDialog.gender}
                value={form.gender}
                onChange={gender => setForm({ ...form, gender })}
                // The create dialog never projected a gender field error
                // before the restyle — `undefined` keeps that behavior.
                error={undefined}
              />
              <Box sx={{ gridColumn: "1 / -1" }}>
                <AdminDialogFieldLabel
                  htmlFor={CREATE_CREDENTIAL_FIELD_ID}
                  text={labels.createDialog.password}
                  required
                />
                <TextField
                  id={CREATE_CREDENTIAL_FIELD_ID}
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  required
                  fullWidth
                  error={!!fieldErrors.password}
                  helperText={fieldErrors.password}
                  aria-invalid={!!fieldErrors.password}
                  slotProps={{
                    input: {
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton
                            aria-label={showPassword ? authLabels.hidePassword : authLabels.showPassword}
                            onClick={() => setShowPassword(prev => !prev)}
                            edge="end"
                            size="small"
                            // Bare icon-only affordance — no border/ring; the
                            // only visible state change is the hover wash.
                            sx={theme => ({
                              border: "none",
                              boxShadow: "none",
                              backgroundColor: "transparent",
                              "&:hover": { backgroundColor: theme.palette.action.hover },
                            })}
                          >
                            {showPassword ? (
                              <HidePasswordIcon fontSize="small" />
                            ) : (
                              <ShowPasswordIcon fontSize="small" />
                            )}
                          </IconButton>
                        </InputAdornment>
                      ),
                    },
                  }}
                />
                <Stack direction="row" spacing={1} sx={{ mt: 1, alignItems: "flex-start" }}>
                  <InfoIcon sx={theme => ({ mt: "2px", fontSize: 16, color: theme.palette.text.secondary })} />
                  <Typography variant="caption" sx={theme => ({ color: theme.palette.text.secondary })}>
                    {labels.createDialog.passwordHelper}
                  </Typography>
                </Stack>
              </Box>
            </Box>

            {/* Info callout — applicant status + admin-account restriction. */}
            <Box
              sx={theme => ({
                display: "flex",
                alignItems: "flex-start",
                gap: 1.5,
                p: 2,
                borderRadius: "10px",
                backgroundColor: theme.palette.surfaceContainerHigh,
                borderInlineStart: `4px solid ${theme.palette.info.main}`,
              })}
            >
              <InfoIcon sx={theme => ({ fontSize: 20, color: theme.palette.info.main })} />
              <Typography variant="body2" sx={theme => ({ color: theme.palette.onSurface })}>
                {labels.createDialog.callout}
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <AdminDialogFooterBand
          cancelLabel={labels.createDialog.cancel}
          submitLabel={labels.createDialog.submit}
          loading={loading}
          onClose={onClose}
        />
      </form>
    </Dialog>
  );
}
