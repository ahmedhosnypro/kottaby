"use client";

/**
 * AdminUserDialogs — shared feedback chrome for the admin user-management
 * surface. The dialogs themselves now live in dedicated sibling modules:
 * `CreateUserDialog.tsx`, `EditUserDialog.tsx`, and `DeleteConfirmDialog.tsx`
 * (shared by BOTH the directory container's row-level actions and the detail
 * container's inline header actions); this module keeps the success snackbar
 * the directory and detail containers render after every completed write.
 */

import { Alert, Snackbar } from "@mui/material";
import type { ReactNode } from "react";

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
