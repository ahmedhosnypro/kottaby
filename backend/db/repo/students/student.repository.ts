/**
 * StudentRepository — data-access layer for the `students` role-child table.
 *
 * The `students` row shares its PK with `users.id` (FK ON DELETE CASCADE) and
 * carries the `handshake_code` parent-linking identifier (A.3) plus the
 * zeroed credit balances (`balance_hifz`, `balance_tajweed`, `balance_reviews`,
 * INV-B1).
 *
 * Writes take a REQUIRED `tx: DBTransaction` (last param) so the registration
 * transaction can roll back on any child-insert failure (REQ-030).
 */
import { students } from "@/backend/db/schema/students/students";
import type { DBTransaction, StudentSelectType } from "@/backend/types";

export namespace StudentRepository {
  /**
   * Inserts a `students` row for a freshly-created user during registration.
   *
   * Balances are explicitly zeroed for clarity-of-contract even though the
   * schema applies `DEFAULT 0` (REQ-012). `handshakeCode` is server-generated
   * by the service layer with a bounded retry loop on unique-violation
   * (REQ-031). `parentId` is `null` at registration — set later via the parent
   * handshake flow (DEV1-013+).
   *
   * @returns The inserted student row.
   */
  export async function createForRegistration(
    userId: number,
    handshakeCode: string,
    tx: DBTransaction
  ): Promise<StudentSelectType> {
    const [row] = await tx
      .insert(students)
      .values({
        id: userId,
        handshakeCode,
        balanceHifz: 0,
        balanceTajweed: 0,
        balanceReviews: 0,
        parentId: null,
      })
      .returning();
    if (!row) {
      throw new Error("StudentRepository.createForRegistration: insert returned no rows");
    }
    return row;
  }
}
