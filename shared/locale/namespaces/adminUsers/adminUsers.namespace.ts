import { defineNamespace } from "@/shared/locale/namespaces/define-namespace";
import type { AdminUsersLabels } from "@/shared/locale/types/adminUsers";

export const AdminUsers = defineNamespace<AdminUsersLabels>(
  "adminUsers.adminUsers",
  translations => translations.adminUsersTranslations
);
