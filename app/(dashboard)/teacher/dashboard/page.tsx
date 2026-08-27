import { UserRole } from "@/backend/enum/users/user-role.enum";
import { createRoleDashboardPage, roleDashboardMetadata } from "@/frontend/views/dashboard/RoleDashboardPage";

export const metadata = roleDashboardMetadata();

export default function TeacherDashboardPage() {
  return createRoleDashboardPage(UserRole.Teacher, "/teacher/dashboard");
}
