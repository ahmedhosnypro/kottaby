/**
 * ParentRepository — data-access layer for the `parents` role-child table.
 *
 * The `parents` row shares its PK with `users.id` (FK ON DELETE CASCADE).
 * Parent-child linking happens later via the `students.parent_id` FK
 * (DEV1-013+); at registration time we only create the empty parent row to
 * establish the persistence home (A.1, C.1).
 */
import { parents } from "@/backend/db/schema/parents/parents";
import type { DBTransaction, ParentSelectType } from "@/backend/types";

export namespace ParentRepository {
  /**
   * Inserts a `parents` row for a freshly-created user during registration.
   *
   * The row carries only the shared PK + timestamps (schema defaults); all
   * parent-child relationships are established by later flows.
   *
   * @returns The inserted parent row.
   */
  export async function createForRegistration(userId: number, tx: DBTransaction): Promise<ParentSelectType> {
    const [row] = await tx.insert(parents).values({ id: userId }).returning();
    if (!row) {
      throw new Error("ParentRepository.createForRegistration: insert returned no rows");
    }
    return row;
  }
}
