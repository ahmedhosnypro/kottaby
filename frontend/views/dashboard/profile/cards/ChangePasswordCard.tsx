"use client";

import {
  LockOutlined as LockIcon,
  VisibilityOutlined as VisibilityIcon,
  VisibilityOffOutlined as VisibilityOffIcon,
} from "@mui/icons-material";
import { Alert, Button, IconButton, InputAdornment, Stack, TextField } from "@mui/material";
import { type ReactNode, useState } from "react";
import { ProfileCardSection } from "@/frontend/views/dashboard/profile/ui";
import type { DashboardLabels } from "@/shared/locale/types/dashboard";

interface ChangePasswordCardProps {
  readonly t: DashboardLabels;
  readonly showPasswordLabel: string;
  readonly hidePasswordLabel: string;
}

/** Renders the change-password form (placeholder — mutation is a future ticket). */
export function ChangePasswordCard({
  t,
  showPasswordLabel,
  hidePasswordLabel,
}: Readonly<ChangePasswordCardProps>): ReactNode {
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  return (
    <ProfileCardSection title={t.changePassword} icon={LockIcon} mb={2}>
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
    </ProfileCardSection>
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
