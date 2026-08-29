/**
 * AdminRepository — data-access layer for the `admin` role-child table.
 *
 * The `admin` row shares its PK with `users.id` (FK ON DELETE CASCADE) and
 * exists for governance tooling. Creating one is a privileged operation
 * reachable ONLY through `RegistrationService.createAdminUser` (the public
 * mutation rejects `role: "admin"` per the BFLA defense).
 */
import { admin } from "@/backend/db/schema/users/admin";
import type { AdminSelectType, DBTransaction } from "@/backend/types";

export namespace AdminRepository {
  /**
   * Inserts an `admin` row for a freshly-created user with `role: "admin"`.
   * Service-only — never invoked from a public resolver path.
   *
   * @returns The inserted admin row.
   */
  export async function create(userId: number, tx: DBTransaction): Promise<AdminSelectType> {
    const [row] = await tx.insert(admin).values({ id: userId }).returning();
    if (!row) {
      throw new Error("AdminRepository.create: insert returned no rows");
    }
    return row;
  }
}
