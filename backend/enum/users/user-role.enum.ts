/**
 * UserRole enum — mirrors the `user_role` pgEnum in `backend/db/schema/enums.ts`.
 * Values derived from `db/schema.dbml` (ground truth per REQ-002).
 */
export enum UserRole {
  Admin = "admin",
  Teacher = "teacher",
  Student = "student",
  Parent = "parent",
}

/**
 * Maps a runtime role string (from a JWT claim, pgEnum row, or transport
 * payload) to the `UserRole` TS enum. Returns `null` if the value is not a
 * recognized role — callers should treat this as "anonymous / tampered"
 * rather than crashing.
 *
 * The string values mirror the enum members exactly (`"admin"`, `"teacher"`,
 * `"student"`, `"parent"`), but TypeScript does not allow assigning a
 * `string` to a nominal enum without an explicit conversion. This helper
 * replaces the unsafe `as UserRole` cast pattern with an exhaustive,
 * type-safe switch.
 */
export function toUserRole(role: string): UserRole | null {
  switch (role) {
    case "admin":
      return UserRole.Admin;
    case "teacher":
      return UserRole.Teacher;
    case "student":
      return UserRole.Student;
    case "parent":
      return UserRole.Parent;
    default:
      return null;
  }
}
