/**
 * RegisterPublicRole enum — the public role subset for registration.
 *
 * Mirrors the `user_role` pgEnum values minus `"admin"`. Used as the
 * single-source-of-truth TS enum for the Pothos `RegisterPublicRole` enum
 * registration (BFLA defense — REQ-022): the public `registerUser` mutation
 * rejects `admin` at the schema layer.
 *
 * The canonical full role enum lives in `user-role.enum.ts` (UserRole).
 */
export enum RegisterPublicRole {
  Student = "student",
  Teacher = "teacher",
  Parent = "parent",
}
