/**
 * PlanFormDialog — Modal dialog for creating and editing subscription plans.
 *
 * Implements REQ-012, REQ-043, REQ-063 (Task 4.4).
 * Handles:
 *  - Unified create/edit flow
 *  - Client & server validation with field-level error messages
 *  - React 19 synthetic form submit handling
 *  - Accessible form fields with `aria-invalid`
 *  - In-flight double-submit mitigation
 */

"use client";

import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useState } from "react";
import type { AdminPlansQuery, CreatePlanInput } from "@/frontend/graphql/generated/gql/graphql";
import { useAppTranslation } from "@/shared/locale/client";
import { Plans } from "@/shared/locale/namespaces/plans";

type PlanItem = AdminPlansQuery["adminPlans"][number];

export interface PlanFormDialogProps {
  readonly open: boolean;
  readonly plan: PlanItem | null;
  readonly loading: boolean;
  readonly globalError?: string | null;
  readonly serverFieldErrors?: Record<string, string>;
  readonly onClose: () => void;
  readonly onSubmit: (input: CreatePlanInput) => Promise<void>;
}

interface FormState {
  readonly title: string;
  readonly sessionCount: string;
  readonly price: string;
  readonly currency: string;
  readonly intervalDays: string;
}

type FormErrors = {
  -readonly [K in keyof FormState]?: string;
};

interface PlanFormContentProps {
  readonly plan: PlanItem | null;
  readonly loading: boolean;
  readonly globalError?: string | null;
  readonly serverFieldErrors?: Record<string, string>;
  readonly onClose: () => void;
  readonly onSubmit: (input: CreatePlanInput) => Promise<void>;
}

function PlanFormContent({
  plan,
  loading,
  globalError,
  serverFieldErrors,
  onClose,
  onSubmit,
}: PlanFormContentProps): React.ReactElement {
  const t = useAppTranslation(Plans);

  const [form, setForm] = useState<FormState>(() => {
    if (plan) {
      return {
        title: plan.title,
        sessionCount: String(plan.sessionCount),
        price: plan.price,
        currency: plan.currency,
        intervalDays: String(plan.intervalDays),
      };
    }
    return {
      title: "",
      sessionCount: "10",
      price: "250.00",
      currency: "EGP",
      intervalDays: "30",
    };
  });

  const [clientErrors, setClientErrors] = useState<FormErrors>({});

  const isEdit = Boolean(plan);
  const title = isEdit ? t.editPlanDialogTitle : t.createPlanDialogTitle;

  const handleChange = (field: keyof FormState) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: event.target.value }));
    if (clientErrors[field]) {
      setClientErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const errors: FormErrors = {};
    const trimmedTitle = form.title.trim();
    if (trimmedTitle.length < 3 || trimmedTitle.length > 100) {
      errors.title = t.validationTitleMessage;
    }

    // Full-value numeric conversion (never `parseInt`): "1.5" and "1abc" must
    // both be rejected instead of silently truncating to 1 (CodeRabbit fix).
    const sessionCountNum = Number(form.sessionCount);
    if (!Number.isInteger(sessionCountNum) || sessionCountNum <= 0) {
      errors.sessionCount = t.validationSessionCountMessage;
    }

    const priceTrimmed = form.price.trim();
    const priceRegex = /^\d+(\.\d{1,2})?$/;
    // Non-negative per the plan contract (price >= 0.00 — "0.00" is a valid
    // free plan); the server CHECK/service layer remains the authority.
    if (!priceRegex.test(priceTrimmed) || Number.parseFloat(priceTrimmed) < 0) {
      errors.price = t.validationPriceMessage;
    }

    const currencyTrimmed = form.currency.trim().toUpperCase();
    if (currencyTrimmed.length !== 3) {
      errors.currency = t.validationCurrencyMessage;
    }

    const intervalDaysNum = Number(form.intervalDays);
    if (!Number.isInteger(intervalDaysNum) || intervalDaysNum <= 0) {
      errors.intervalDays = t.validationIntervalDaysMessage;
    }

    setClientErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate()) {
      return;
    }

    await onSubmit({
      title: form.title.trim(),
      // validate() has already guaranteed whole-number conversions; reuse the
      // exact same conversion instead of a second (truncating) parseInt.
      sessionCount: Number(form.sessionCount),
      price: form.price.trim(),
      currency: form.currency.trim().toUpperCase(),
      intervalDays: Number(form.intervalDays),
    });
  };

  const fieldError = (field: keyof FormState): string | undefined => {
    return clientErrors[field] ?? serverFieldErrors?.[field];
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <DialogTitle id="plan-form-dialog-title" sx={{ fontWeight: 600 }}>
        {title}
      </DialogTitle>
      <DialogContent>
        <Stack sx={{ gap: 2.5, mt: 1 }}>
          {globalError && (
            <Alert severity="error" sx={{ width: "100%" }}>
              {globalError}
            </Alert>
          )}

          <TextField
            label={t.titleFieldLabel}
            placeholder={t.titleFieldPlaceholder}
            value={form.title}
            onChange={handleChange("title")}
            error={Boolean(fieldError("title"))}
            helperText={fieldError("title")}
            aria-invalid={Boolean(fieldError("title"))}
            fullWidth
            required
            disabled={loading}
          />

          <Stack sx={{ flexDirection: { xs: "column", sm: "row" }, gap: 2 }}>
            <TextField
              label={t.sessionCountFieldLabel}
              type="number"
              value={form.sessionCount}
              onChange={handleChange("sessionCount")}
              error={Boolean(fieldError("sessionCount"))}
              helperText={fieldError("sessionCount")}
              aria-invalid={Boolean(fieldError("sessionCount"))}
              fullWidth
              required
              disabled={loading}
            />

            <TextField
              label={t.intervalDaysFieldLabel}
              type="number"
              value={form.intervalDays}
              onChange={handleChange("intervalDays")}
              error={Boolean(fieldError("intervalDays"))}
              helperText={fieldError("intervalDays")}
              aria-invalid={Boolean(fieldError("intervalDays"))}
              fullWidth
              required
              disabled={loading}
            />
          </Stack>

          <Stack sx={{ flexDirection: { xs: "column", sm: "row" }, gap: 2 }}>
            <TextField
              label={t.priceFieldLabel}
              value={form.price}
              onChange={handleChange("price")}
              error={Boolean(fieldError("price"))}
              helperText={fieldError("price")}
              aria-invalid={Boolean(fieldError("price"))}
              fullWidth
              required
              disabled={loading}
            />

            <TextField
              label={t.currencyFieldLabel}
              value={form.currency}
              onChange={handleChange("currency")}
              error={Boolean(fieldError("currency"))}
              helperText={fieldError("currency")}
              aria-invalid={Boolean(fieldError("currency"))}
              fullWidth
              required
              disabled={loading}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose} disabled={loading} color="inherit">
          {t.cancelButton}
        </Button>
        <Button
          type="submit"
          disabled={loading}
          variant="contained"
          color="primary"
          startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}
        >
          {loading ? t.savingButton : t.saveButton}
        </Button>
      </DialogActions>
    </form>
  );
}

export function PlanFormDialog({
  open,
  plan,
  loading,
  globalError,
  serverFieldErrors,
  onClose,
  onSubmit,
}: PlanFormDialogProps): React.ReactElement {
  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="plan-form-dialog-title"
    >
      {open && (
        <PlanFormContent
          key={plan?.id ?? "new"}
          plan={plan}
          loading={loading}
          globalError={globalError}
          serverFieldErrors={serverFieldErrors}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}
