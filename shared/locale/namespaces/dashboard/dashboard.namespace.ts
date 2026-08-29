import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { DashboardLabels } from "@/shared/locale/types/dashboard";

export const Dashboard = defineNamespace<DashboardLabels>(
  "dashboard.dashboard",
  translations => translations.dashboardTranslations
);
