/**
 * PlanCatalogContainer — Root client container for admin plan catalog management.
 *
 * Implements REQ-054, REQ-060, REQ-062, REQ-063, REQ-064 (Task 4.3).
 * Integrates:
 *  - Apollo useQuery & useMutation hooks with cache normalization
 *  - Create & Edit plan dialogs (PlanFormDialog)
 *  - Status change confirmation dialog (PlanStatusConfirmDialog)
 *  - Success snackbar notifications
 *  - Localized i18n via useAppTranslation(Plans)
 */

"use client";

import { useMutation, useQuery } from "@apollo/client/react";
import { AddOutlined as AddIcon } from "@mui/icons-material";
import { Alert, Box, Button, Container, Snackbar, Stack, Typography } from "@mui/material";
import { useState } from "react";
import type { AdminPlansQuery, CreatePlanInput } from "@/frontend/graphql/generated/gql/graphql";
import {
  adminPlansQueryDocument,
  createPlanMutationDocument,
  setPlanActiveStatusMutationDocument,
  updatePlanMutationDocument,
} from "@/frontend/graphql/sharedDocuments/billing";
import { PlanCatalogTable } from "@/frontend/views/admin/plans/PlanCatalogTable";
import { PlanFormDialog } from "@/frontend/views/admin/plans/PlanFormDialog";
import { PlanStatusConfirmDialog } from "@/frontend/views/admin/plans/PlanStatusConfirmDialog";
import { useAppTranslation } from "@/shared/locale/client";
import { Plans } from "@/shared/locale/namespaces/plans";

type PlanItem = AdminPlansQuery["adminPlans"][number];

export function PlanCatalogContainer(): React.ReactElement {
  const t = useAppTranslation(Plans);

  // Queries
  const {
    data,
    loading,
    error: queryError,
    refetch,
  } = useQuery(adminPlansQueryDocument, {
    variables: { includeInactive: true },
    fetchPolicy: "cache-and-network",
  });

  // Mutations
  const [createPlan, { loading: createLoading }] = useMutation(createPlanMutationDocument);
  const [updatePlan, { loading: updateLoading }] = useMutation(updatePlanMutationDocument);
  const [setStatus, { loading: statusLoading }] = useMutation(setPlanActiveStatusMutationDocument);

  // Dialog & state management
  const [formOpen, setFormOpen] = useState(false);
  const [selectedPlanForEdit, setSelectedPlanForEdit] = useState<PlanItem | null>(null);
  const [formGlobalError, setFormGlobalError] = useState<string | null>(null);

  const [statusOpen, setStatusOpen] = useState(false);
  const [selectedPlanForStatus, setSelectedPlanForStatus] = useState<PlanItem | null>(null);
  const [targetActive, setTargetActive] = useState<boolean>(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const plans = data?.adminPlans ?? [];

  // Handlers
  const handleOpenCreate = () => {
    setSelectedPlanForEdit(null);
    setFormGlobalError(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (plan: PlanItem) => {
    setSelectedPlanForEdit(plan);
    setFormGlobalError(null);
    setFormOpen(true);
  };

  const handleOpenStatus = (plan: PlanItem, nextActive: boolean) => {
    setSelectedPlanForStatus(plan);
    setTargetActive(nextActive);
    setStatusError(null);
    setStatusOpen(true);
  };

  const handleFormSubmit = async (input: CreatePlanInput) => {
    setFormGlobalError(null);
    try {
      if (selectedPlanForEdit) {
        await updatePlan({
          variables: {
            id: selectedPlanForEdit.id,
            input: {
              title: input.title,
              sessionCount: input.sessionCount,
              price: input.price,
              currency: input.currency,
              intervalDays: input.intervalDays,
            },
          },
        });
        setToastMessage(t.updateSuccessToast);
      } else {
        await createPlan({
          variables: { input },
        });
        setToastMessage(t.createSuccessToast);
        await refetch();
      }
      setFormOpen(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setFormGlobalError(err.message);
      } else {
        setFormGlobalError(t.unexpectedErrorMessage);
      }
    }
  };

  const handleStatusConfirm = async (plan: PlanItem, nextActive: boolean) => {
    setStatusError(null);
    setActionLoadingId(plan.id);
    try {
      await setStatus({
        variables: {
          id: plan.id,
          isActive: nextActive,
        },
      });
      setToastMessage(t.statusChangeSuccessToast);
      setStatusOpen(false);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setStatusError(err.message);
      } else {
        setStatusError(t.statusChangeErrorMessage);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Page Header */}
      <Stack
        sx={{
          flexDirection: { xs: "column", sm: "row" },
          justifyContent: "space-between",
          alignItems: { xs: "flex-start", sm: "center" },
          gap: 2,
          mb: 4,
        }}
      >
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
            {t.pageTitle}
          </Typography>
          <Typography variant="body1" sx={theme => ({ color: theme.palette.text.secondary })}>
            {t.pageSubtitle}
          </Typography>
        </Box>
        <Button variant="contained" color="primary" startIcon={<AddIcon />} onClick={handleOpenCreate}>
          {t.createPlanButton}
        </Button>
      </Stack>

      {/* Query Error Alert */}
      {queryError && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {queryError.message}
        </Alert>
      )}

      {/* Catalog Table */}
      <PlanCatalogTable
        plans={plans}
        loading={loading}
        actionLoadingId={actionLoadingId}
        onEdit={handleOpenEdit}
        onToggleStatus={handleOpenStatus}
        onCreateNew={handleOpenCreate}
      />

      {/* Create / Edit Form Dialog */}
      <PlanFormDialog
        open={formOpen}
        plan={selectedPlanForEdit}
        loading={createLoading || updateLoading}
        globalError={formGlobalError}
        onClose={() => setFormOpen(false)}
        onSubmit={handleFormSubmit}
      />

      {/* Status Confirmation Dialog */}
      <PlanStatusConfirmDialog
        open={statusOpen}
        plan={selectedPlanForStatus}
        targetActive={targetActive}
        loading={statusLoading}
        error={statusError}
        onClose={() => setStatusOpen(false)}
        onConfirm={handleStatusConfirm}
      />

      {/* Feedback Toast */}
      <Snackbar
        open={Boolean(toastMessage)}
        autoHideDuration={4000}
        onClose={() => setToastMessage(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" onClose={() => setToastMessage(null)} sx={{ width: "100%" }}>
          {toastMessage}
        </Alert>
      </Snackbar>
    </Container>
  );
}
