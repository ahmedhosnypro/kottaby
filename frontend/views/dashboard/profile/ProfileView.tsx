"use client";

import {
  BadgeOutlined as BadgeIcon,
  BlockOutlined as BlockIcon,
  CheckCircleOutlined as CheckCircleIcon,
  EditOutlined as EditIcon,
  EmailOutlined as EmailIcon,
  LanguageOutlined as LanguageIcon,
  LockOutlined as LockIcon,
  MenuBookOutlined as MenuBookIcon,
  PersonOutlined as PersonIcon,
  PhoneOutlined as PhoneIcon,
  PublicOutlined as PublicIcon,
  type SvgIconComponent,
  VisibilityOutlined as VisibilityIcon,
  VisibilityOffOutlined as VisibilityOffIcon,
  WarningAmberOutlined as WarningIcon,
} from "@mui/icons-material";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { type ReactNode, useState, useSyncExternalStore } from "react";
import { Gender, UserRole } from "@/frontend/graphql/generated/gql/graphql";
import { useAuth } from "@/frontend/hooks/useAuth";
import { roleDashboardPath } from "@/frontend/lib/auth/roleDashboardRoute";
import { getRecitationDescription, getRecitationLabel } from "@/frontend/lib/recitation-labels";
import { Auth, Dashboard, Recitation, useAppTranslation } from "@/shared/locale";
import type { DashboardLabels } from "@/shared/locale/types/dashboard";

/**
 * Mounted guard — returns `false` during SSR / first client render, `true`
 * after hydration. Implemented with `useSyncExternalStore` (no
 * `setState`-in-effect) so the React Compiler + oxlint
 * `react/set-state-in-effect` rule stays green.
 *
 * Used to defer rendering of auth-aware UI until the client has had a chance
 * to read its cookies / Apollo cache. Server and first-client render both
 * produce the loading state; the second client render reveals the resolved
 * auth state — no hydration mismatch.
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

/**
 * ProfileView — user profile page.
 *
 * Shows the authenticated user's information in a card-based layout:
 *  - Header card: avatar + full name + email + role chip + edit-profile
 *    button (placeholder — editing is a future ticket).
 *  - Account Information card: full name, email, phone, role, country,
 *    gender (read from `useAuth().user`).
 *  - Recitation Reading card: current preferred recitation with description.
 *  - Account Status card: isDeleted / suspended / isBlocked status badges.
 *  - Change Password form: current + new + confirm password fields
 *    (placeholder — wired to a "coming soon" notice since the
 *    `changePassword` mutation doesn't exist yet).
 *
 * If the user is not authenticated, shows a sign-in prompt.
 *
 * Hydration safety: a `mounted` guard prevents SSR/CSR mismatch on the
 * `useAuth()` result (the `me` query resolves client-side; the server render
 * sees `isLoading: true`, the client sees the resolved state).
 *
 * MUI v9 patterns: `sx` callback only (no string-based color props),
 * `*Outlined` icons, theme palette colors. All user-facing strings via
 * `useAppTranslation` (Dashboard + Auth + Recitation namespaces).
 */
export function ProfileView(): ReactNode {
  const t = useAppTranslation(Dashboard);
  const tAuth = useAppTranslation(Auth);
  const tRecitation = useAppTranslation(Recitation);
  const { user, isAuthenticated, isLoading } = useAuth();

  // Hydration guard — `useAuth()` resolves client-side; the server render
  // sees `isLoading: true`, the client resolves to the authenticated state.
  // Rendering nothing until mounted avoids the SSR/CSR mismatch warning.
  // Uses `useSyncExternalStore` (no `setState`-in-effect).
  const mounted = useMounted();

  if (!mounted || isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "60vh",
          p: 3,
        }}
      >
        <Card
          elevation={0}
          sx={theme => ({
            maxWidth: 400,
            width: "100%",
            textAlign: "center",
            p: 4,
            borderRadius: 3,
            border: "1px solid",
            borderColor: theme.palette.outlineVariant,
          })}
        >
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 700 }}>
            {t.signInPromptTitle}
          </Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, mb: 3 })}>
            {t.signInPromptBody}
          </Typography>
          <Button variant="contained" href="/login" fullWidth>
            {tAuth.loginSubmit}
          </Button>
        </Card>
      </Box>
    );
  }

  const recitationLabel = user.preferredRecitation ? getRecitationLabel(user.preferredRecitation, tRecitation) : null;
  const recitationDesc = user.preferredRecitation
    ? getRecitationDescription(user.preferredRecitation, tRecitation)
    : null;
  const roleLabel = getRoleLabel(user.role, tAuth);

  const avatarLetter = user.fullName.charAt(0).toUpperCase();

  return (
    <Box sx={{ maxWidth: 960, mx: "auto" }}>
      {/* === Header === */}
      <Stack
        direction="row"
        spacing={2}
        sx={{
          alignItems: "center",
          mb: 4,
        }}
      >
        <Avatar
          alt={t.userAvatarAlt(user.fullName)}
          sx={theme => ({
            width: 64,
            height: 64,
            bgcolor: theme.palette.primary.main,
            color: theme.palette.onPrimary,
            fontSize: 28,
            fontWeight: 700,
            flexShrink: 0,
          })}
        >
          {avatarLetter}
        </Avatar>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            {user.fullName}
          </Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
            {user.email}
          </Typography>
        </Box>
        <Chip
          label={roleLabel}
          variant="outlined"
          sx={theme => ({
            fontWeight: 600,
            textTransform: "capitalize",
            borderColor: theme.palette.primary.main,
            color: theme.palette.primary.main,
          })}
        />
      </Stack>

      {/* === Info grid: Account Info + Recitation === */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
          gap: 2,
          mb: 2,
        }}
      >
        {/* Account info card */}
        <Card
          elevation={0}
          sx={theme => ({
            borderRadius: 3,
            border: "1px solid",
            borderColor: theme.palette.outlineVariant,
          })}
        >
          <CardContent sx={{ p: 3 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
              {t.accountInfo}
            </Typography>
            <Stack spacing={2}>
              <InfoRow icon={PersonIcon} label={t.fullName} value={user.fullName} t={t} />
              <InfoRow icon={EmailIcon} label={t.email} value={user.email} t={t} />
              <InfoRow icon={PhoneIcon} label={t.phone} value={user.phone} t={t} />
              <InfoRow icon={BadgeIcon} label={t.role} value={roleLabel} t={t} />
              <InfoRow icon={PublicIcon} label={t.country} value={user.country} t={t} />
              <InfoRow icon={LanguageIcon} label={t.gender} value={getGenderLabel(user.gender, tAuth)} t={t} />
            </Stack>
          </CardContent>
        </Card>

        {/* Recitation preference card */}
        <Card
          elevation={0}
          sx={theme => ({
            borderRadius: 3,
            border: "1px solid",
            borderColor: theme.palette.outlineVariant,
          })}
        >
          <CardContent sx={{ p: 3 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
              <MenuBookIcon fontSize="small" sx={theme => ({ color: theme.palette.primary.main })} />
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                {t.recitationReading}
              </Typography>
            </Stack>
            {recitationLabel ? (
              <Box
                sx={theme => ({
                  p: 2,
                  borderRadius: 2,
                  bgcolor: theme.palette.primaryContainer,
                  color: theme.palette.onPrimaryContainer,
                })}
              >
                <Typography variant="body1" sx={{ fontWeight: 600 }}>
                  {recitationLabel}
                </Typography>
                {recitationDesc ? (
                  <Typography variant="caption" sx={{ opacity: 0.85, mt: 0.5, display: "block" }}>
                    {recitationDesc}
                  </Typography>
                ) : null}
              </Box>
            ) : (
              <Alert severity="info" variant="outlined">
                {tRecitation.selectHelper}
              </Alert>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* === Account status card === */}
      <Card
        elevation={0}
        sx={theme => ({
          borderRadius: 3,
          border: "1px solid",
          borderColor: theme.palette.outlineVariant,
          mb: 2,
        })}
      >
        <CardContent sx={{ p: 3 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>
            {t.accountStatus}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <StatusBadge
              active={!user.isDeleted && !user.suspended && !user.isBlocked}
              label={t.statusActive}
              Icon={CheckCircleIcon}
              tone="success"
            />
            <StatusBadge active={user.isDeleted} label={t.statusDeleted} Icon={WarningIcon} tone="error" />
            <StatusBadge active={user.suspended} label={t.statusSuspended} Icon={WarningIcon} tone="warning" />
            <StatusBadge active={user.isBlocked} label={t.statusBlocked} Icon={BlockIcon} tone="error" />
          </Stack>
        </CardContent>
      </Card>

      {/* === Change password card === */}
      <ChangePasswordCard t={t} showPasswordLabel={tAuth.showPassword} hidePasswordLabel={tAuth.hidePassword} />

      <Divider sx={{ my: 3 }} />

      {/* === Actions === */}
      <Stack direction="row" spacing={2} sx={{ justifyContent: "center", flexWrap: "wrap", gap: 1 }}>
        {/* Role-specific dashboard — never bare "/dashboard" (preview-gateway
            redirect loop, see `frontend/lib/auth/roleDashboardRoute.ts`). */}
        <Button variant="outlined" href={roleDashboardPath(user.role)} startIcon={<LanguageIcon />}>
          {t.backToDashboard}
        </Button>
        <Button variant="contained" startIcon={<EditIcon />} disabled>
          {t.editProfile}
        </Button>
      </Stack>

      {/* Edit-profile notice — explains why the button is disabled */}
      <Typography
        variant="caption"
        sx={theme => ({
          display: "block",
          textAlign: "center",
          mt: 1,
          color: theme.palette.text.secondary,
        })}
      >
        {t.editProfileNotice}
      </Typography>
    </Box>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------

interface InfoRowProps {
  readonly icon: SvgIconComponent;
  readonly label: string;
  readonly value: string | null | undefined;
  readonly t: DashboardLabels;
}

/** Renders a single labeled value row with a leading icon. */
function InfoRow({ icon: Icon, label, value, t }: Readonly<InfoRowProps>): ReactNode {
  const displayValue = value && value.trim().length > 0 ? value : t.notProvided;
  const isPlaceholder = !value || value.trim().length === 0;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
      <Box sx={theme => ({ color: theme.palette.text.secondary, display: "flex" })}>
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={theme => ({
            display: "block",
            lineHeight: 1.2,
            color: theme.palette.text.secondary,
          })}
        >
          {label}
        </Typography>
        <Typography
          variant="body2"
          sx={{
            fontWeight: 500,
            overflow: "hidden",
            textOverflow: "ellipsis",
            color: theme => (isPlaceholder ? theme.palette.text.disabled : theme.palette.text.primary),
          }}
        >
          {displayValue}
        </Typography>
      </Box>
    </Stack>
  );
}

interface StatusBadgeProps {
  readonly active: boolean;
  readonly label: string;
  readonly Icon: SvgIconComponent;
  readonly tone: "success" | "warning" | "error";
}

/**
 * Renders a status badge — colored chip with icon. Inactive badges render in
 * a muted `outlined` style so the active state stands out.
 */
function StatusBadge({ active, label, Icon, tone }: Readonly<StatusBadgeProps>): ReactNode {
  if (!active) {
    return (
      <Chip
        icon={<Icon />}
        label={label}
        variant="outlined"
        disabled
        sx={theme => ({
          borderColor: theme.palette.outlineVariant,
          color: theme.palette.text.disabled,
          fontWeight: 600,
        })}
      />
    );
  }
  // Resolve the tone-specific container + onContainer colors via a single
  // lookup object (avoids nested ternaries — sonarjs/no-nested-conditional).
  const tonePalette = resolveTonePalette(tone);
  return (
    <Chip
      icon={<Icon />}
      label={label}
      sx={theme => ({
        fontWeight: 600,
        bgcolor: tonePalette.bg(theme.palette),
        color: tonePalette.fg(theme.palette),
      })}
    />
  );
}

/** Per-tone container + foreground color resolver (used by StatusBadge). */
interface TonePalette {
  readonly bg: (palette: import("@mui/material/styles").Palette) => string;
  readonly fg: (palette: import("@mui/material/styles").Palette) => string;
}

/** Maps a `tone` to its container + onContainer color tokens. */
function resolveTonePalette(tone: "success" | "warning" | "error"): TonePalette {
  switch (tone) {
    case "success":
      return {
        bg: p => p.successContainer,
        fg: p => p.onSuccessContainer,
      };
    case "warning":
      return {
        bg: p => p.warningContainer,
        fg: p => p.onWarningContainer,
      };
    case "error":
      return {
        bg: p => p.errorContainer,
        fg: p => p.onErrorContainer,
      };
    default:
      // Defensive — should never reach here given the union type.
      return {
        bg: p => p.surfaceContainer,
        fg: p => p.onSurface,
      };
  }
}

interface ChangePasswordCardProps {
  readonly t: DashboardLabels;
  readonly showPasswordLabel: string;
  readonly hidePasswordLabel: string;
}

/** Renders the change-password form (placeholder — mutation is a future ticket). */
function ChangePasswordCard({ t, showPasswordLabel, hidePasswordLabel }: Readonly<ChangePasswordCardProps>): ReactNode {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <Card
      elevation={0}
      sx={theme => ({
        borderRadius: 3,
        border: "1px solid",
        borderColor: theme.palette.outlineVariant,
        mb: 2,
      })}
    >
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 2 }}>
          <LockIcon fontSize="small" sx={theme => ({ color: theme.palette.primary.main })} />
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {t.changePassword}
          </Typography>
        </Stack>

        <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>
          {t.changePasswordNotice}
        </Alert>

        <Stack spacing={2}>
          <PasswordField
            label={t.currentPassword}
            value=""
            showValue={showCurrent}
            onToggleVisibility={() => setShowCurrent(!showCurrent)}
            autoComplete="current-password"
            visibleLabel={hidePasswordLabel}
            hiddenLabel={showPasswordLabel}
            disabled
          />
          <PasswordField
            label={t.newPassword}
            value=""
            showValue={showNew}
            onToggleVisibility={() => setShowNew(!showNew)}
            autoComplete="new-password"
            visibleLabel={hidePasswordLabel}
            hiddenLabel={showPasswordLabel}
            disabled
          />
          <PasswordField
            label={t.confirmPassword}
            value=""
            showValue={showConfirm}
            onToggleVisibility={() => setShowConfirm(!showConfirm)}
            autoComplete="new-password"
            visibleLabel={hidePasswordLabel}
            hiddenLabel={showPasswordLabel}
            disabled
          />

          <Button variant="contained" startIcon={<LockIcon />} disabled>
            {t.updatePassword}
          </Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

interface PasswordFieldProps {
  readonly label: string;
  readonly value: string;
  readonly showValue: boolean;
  readonly onToggleVisibility: () => void;
  readonly autoComplete: string;
  readonly visibleLabel: string;
  readonly hiddenLabel: string;
  readonly disabled: boolean;
}

/** A password TextField with a show/hide visibility toggle. */
function PasswordField({
  label,
  value,
  showValue,
  onToggleVisibility,
  autoComplete,
  visibleLabel,
  hiddenLabel,
  disabled,
}: Readonly<PasswordFieldProps>): ReactNode {
  return (
    <TextField
      label={label}
      type={showValue ? "text" : "password"}
      value={value}
      autoComplete={autoComplete}
      disabled={disabled}
      fullWidth
      slotProps={{
        input: {
          startAdornment: <LockIcon fontSize="small" sx={theme => ({ mr: 1, color: theme.palette.action.active })} />,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label={showValue ? hiddenLabel : visibleLabel}
                onClick={onToggleVisibility}
                edge="end"
                size="small"
                disabled={disabled}
              >
                {showValue ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

/** Maps a UserRole to its translated display label (via the Auth namespace). */
function getRoleLabel(
  role: UserRole,
  t: { readonly roleStudent: string; readonly roleTeacher: string; readonly roleParent: string }
): string {
  switch (role) {
    case UserRole.Student:
      return t.roleStudent;
    case UserRole.Teacher:
      return t.roleTeacher;
    case UserRole.Parent:
      return t.roleParent;
    default:
      // Admin and unknown roles fall through to a capitalized raw string.
      return role.charAt(0).toUpperCase() + role.slice(1);
  }
}

/** Maps a Gender to its translated display label (via the Auth namespace). */
function getGenderLabel(
  gender: Gender | null | undefined,
  t: { readonly genderMale: string; readonly genderFemale: string; readonly genderOther: string }
): string | null {
  if (!gender) return null;
  switch (gender) {
    case Gender.Male:
      return t.genderMale;
    case Gender.Female:
      return t.genderFemale;
    case Gender.Other:
      return t.genderOther;
    default:
      return null;
  }
}
