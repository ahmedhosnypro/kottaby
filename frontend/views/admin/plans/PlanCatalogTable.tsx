/**
 * PlanCatalogTable — Data table and responsive card view for admin plan catalog.
 *
 * Implements REQ-054, REQ-060, REQ-062 (Task 4.3).
 * Features:
 *  - Responsive desktop Table / mobile Card Stack
 *  - Theme-callback token styling (zero hardcoded hex/strings)
 *  - Status chips (Active / Inactive)
 *  - Row-level action buttons (Edit, Activate/Deactivate) with pending spinners
 *  - Accessible empty state with Create CTA
 *  - Skeleton loading state
 */

"use client";

import {
  CheckCircleOutlined as ActivateIcon,
  BlockOutlined as DeactivateIcon,
  EditOutlined as EditIcon,
  VerifiedOutlined as EmptyIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from "@mui/material";
import type { AdminPlansQuery } from "@/frontend/graphql/generated/gql/graphql";
import { useAppTranslation } from "@/shared/locale/client";
import { Plans } from "@/shared/locale/namespaces/plans";

type PlanItem = AdminPlansQuery["adminPlans"][number];

export interface PlanCatalogTableProps {
  readonly plans: readonly PlanItem[];
  readonly loading: boolean;
  readonly actionLoadingId?: string | null;
  readonly onEdit: (plan: PlanItem) => void;
  readonly onToggleStatus: (plan: PlanItem, targetActive: boolean) => void;
  readonly onCreateNew: () => void;
}

interface PlanStatusChipProps {
  readonly isActive: boolean;
  readonly activeLabel: string;
  readonly inactiveLabel: string;
}

function PlanStatusChip({ isActive, activeLabel, inactiveLabel }: PlanStatusChipProps): React.ReactElement {
  return (
    <Chip
      label={isActive ? activeLabel : inactiveLabel}
      size="small"
      sx={theme => ({
        backgroundColor: isActive ? theme.palette.success.main : theme.palette.action.selected,
        color: isActive ? theme.palette.success.contrastText : theme.palette.text.primary,
        fontWeight: 600,
      })}
    />
  );
}

function formatDate(dateStr: string | null | undefined, emptyLabel: string): string {
  if (!dateStr) return emptyLabel;
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export function PlanCatalogTable({
  plans,
  loading,
  actionLoadingId,
  onEdit,
  onToggleStatus,
  onCreateNew,
}: PlanCatalogTableProps): React.ReactElement {
  const t = useAppTranslation(Plans);

  // Skeleton loading state
  if (loading && plans.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={theme => ({
          border: 1,
          borderColor: theme.palette.divider,
          borderRadius: 2,
          p: 2,
        })}
      >
        <Stack sx={{ gap: 2 }}>
          {Array.from({ length: 4 }).map((_, idx) => (
            <Skeleton key={`skeleton-row-${String(idx)}`} variant="rectangular" height={52} sx={{ borderRadius: 1 }} />
          ))}
        </Stack>
      </Paper>
    );
  }

  // Empty state
  if (!loading && plans.length === 0) {
    return (
      <Paper
        elevation={0}
        sx={theme => ({
          border: 1,
          borderColor: theme.palette.divider,
          borderRadius: 2,
          p: 6,
          textAlign: "center",
          backgroundColor: theme.palette.background.paper,
        })}
      >
        <Stack sx={{ alignItems: "center", gap: 2 }}>
          <EmptyIcon sx={theme => ({ fontSize: 48, color: theme.palette.text.secondary })} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t.emptyTitle}
          </Typography>
          <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary, maxWidth: 400 })}>
            {t.emptyDescription}
          </Typography>
          <Button variant="contained" onClick={onCreateNew} sx={{ mt: 1 }}>
            {t.createPlanButton}
          </Button>
        </Stack>
      </Paper>
    );
  }

  return (
    <>
      {/* Mobile Card-Stack View (visible below sm) */}
      <Box sx={{ display: { xs: "flex", md: "none" }, flexDirection: "column", gap: 2 }}>
        {plans.map(plan => {
          const isActionPending = actionLoadingId === plan.id;
          return (
            <Card
              key={plan.id}
              elevation={0}
              sx={theme => ({
                border: 1,
                borderColor: theme.palette.divider,
                borderRadius: 2,
              })}
            >
              <CardContent sx={{ pb: 1 }}>
                <Stack sx={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    {plan.title}
                  </Typography>
                  <PlanStatusChip
                    isActive={plan.isActive}
                    activeLabel={t.activeStatus}
                    inactiveLabel={t.inactiveStatus}
                  />
                </Stack>
                <Stack sx={{ gap: 0.5 }}>
                  <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
                    {t.sessionCountColumn}: <strong>{plan.sessionCount}</strong>
                  </Typography>
                  <Typography variant="body2" sx={theme => ({ color: theme.palette.text.secondary })}>
                    {t.priceColumn}:{" "}
                    <strong>
                      <span dir="ltr">
                        {plan.price} {plan.currency}
                      </span>
                    </strong>
                    {" · "}
                    {plan.intervalDays} {t.intervalDaysShort}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={theme => ({ color: theme.palette.text.secondary, whiteSpace: "nowrap" })}
                  >
                    {t.createdAtColumn}: {formatDate(plan.createdAt, t.emptyValue)}
                  </Typography>
                  {!plan.isActive && plan.deactivatedAt && (
                    <Typography
                      variant="caption"
                      sx={theme => ({ color: theme.palette.error.main, whiteSpace: "nowrap" })}
                    >
                      {t.deactivatedAtColumn}: {formatDate(plan.deactivatedAt, t.emptyValue)}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2, pt: 0, justifyContent: "flex-end" }}>
                <Button
                  size="small"
                  startIcon={<EditIcon />}
                  onClick={() => onEdit(plan)}
                  disabled={isActionPending}
                  sx={{ minHeight: 44 }}
                >
                  {t.editPlanButton}
                </Button>
                <Button
                  size="small"
                  startIcon={plan.isActive ? <DeactivateIcon /> : <ActivateIcon />}
                  onClick={() => onToggleStatus(plan, !plan.isActive)}
                  disabled={isActionPending}
                  sx={theme => ({
                    color: plan.isActive ? theme.palette.error.main : theme.palette.primary.main,
                    minHeight: 44,
                  })}
                >
                  {plan.isActive ? t.deactivatePlanButton : t.activatePlanButton}
                </Button>
              </CardActions>
            </Card>
          );
        })}
      </Box>

      {/* Desktop Table View (visible md and up) */}
      <TableContainer
        component={Paper}
        elevation={0}
        sx={theme => ({
          display: { xs: "none", md: "block" },
          border: 1,
          borderColor: theme.palette.divider,
          borderRadius: 2,
        })}
      >
        <Table aria-label={t.pageTitle}>
          <TableHead>
            <TableRow sx={theme => ({ backgroundColor: theme.palette.action.hover })}>
              <TableCell sx={{ fontWeight: 600 }}>{t.titleColumn}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t.sessionCountColumn}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t.priceColumn}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t.intervalDaysColumn}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t.statusColumn}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t.createdAtColumn}</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>{t.deactivatedAtColumn}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {t.actionsColumn}
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {plans.map(plan => {
              const isActionPending = actionLoadingId === plan.id;
              return (
                <TableRow
                  key={plan.id}
                  hover
                  sx={theme => ({
                    opacity: plan.isActive ? 1 : 0.75,
                    "&:last-child td, &:last-child th": { border: 0 },
                    backgroundColor: plan.isActive ? theme.palette.background.paper : theme.palette.action.hover,
                  })}
                >
                  <TableCell component="th" scope="row" sx={{ fontWeight: 500 }}>
                    {plan.title}
                  </TableCell>
                  <TableCell>{plan.sessionCount}</TableCell>
                  <TableCell>
                    <span dir="ltr">
                      {plan.price} {plan.currency}
                    </span>
                  </TableCell>
                  <TableCell>{plan.intervalDays}</TableCell>
                  <TableCell>
                    <PlanStatusChip
                      isActive={plan.isActive}
                      activeLabel={t.activeStatus}
                      inactiveLabel={t.inactiveStatus}
                    />
                  </TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(plan.createdAt, t.emptyValue)}</TableCell>
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(plan.deactivatedAt, t.emptyValue)}</TableCell>
                  <TableCell align="right">
                    <Stack sx={{ flexDirection: "row", justifyContent: "flex-end", gap: 1 }}>
                      <Tooltip title={t.editPlanButton}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => onEdit(plan)}
                            disabled={isActionPending}
                            aria-label={`${t.editPlanButton} ${plan.title}`}
                            sx={{ width: 44, height: 44 }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={plan.isActive ? t.deactivatePlanButton : t.activatePlanButton}>
                        <span>
                          <IconButton
                            size="small"
                            onClick={() => onToggleStatus(plan, !plan.isActive)}
                            disabled={isActionPending}
                            aria-label={
                              plan.isActive
                                ? `${t.deactivatePlanButton} ${plan.title}`
                                : `${t.activatePlanButton} ${plan.title}`
                            }
                            sx={theme => ({
                              width: 44,
                              height: 44,
                              color: plan.isActive ? theme.palette.error.main : theme.palette.primary.main,
                            })}
                          >
                            {plan.isActive ? <DeactivateIcon fontSize="small" /> : <ActivateIcon fontSize="small" />}
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
