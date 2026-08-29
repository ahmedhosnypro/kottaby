/**
 * Admin user GraphQL objects — directory row, page envelope, detail, and
 * role-child snapshot projections for the admin user-management surface.
 *
 * Every object is backed by a canonical type from `backend/types/admin/`:
 *  - `AdminUserListItem` ← `AdminUserListItemReturnType`
 *  - `AdminUserPage` ← `AdminUserPageReturnType`
 *  - `AdminUserDetail` ← `AdminUserDetailReturnType`
 *  - `AdminTeacherSnapshot` ← `AdminTeacherSnapshotReturnType`
 *  - `AdminStudentSnapshot` ← `AdminStudentSnapshotReturnType`
 *  - `AdminParentSnapshot` ← `AdminParentSnapshotReturnType`
 *
 * The `applicant` field on `AdminUserDetail` reuses the DEV2-004 canonical
 * `ApplicantProfilePothosObject` — never re-declared here.
 *
 * `passwordHash` is structurally absent from every shape (composed via
 * `Omit<UserSelectType, "passwordHash">` at the canonical-type layer);
 * Pothos exposes only the fields on the underlying type, so the hash is
 * unreachable.
 *
 * Per `backend/graphql/pothos/AGENTS.md`:
 *  - NO local type definitions — all shapes come from `backend/types/**`.
 *  - `id` is exposed FIRST on every object (Int) so Apollo cache
 *    normalization keys consistently.
 *  - Enums are imported from the shared enum registry — never re-registered.
 */
import { isApplicantStatus } from "@/backend/enum/teachers/applicant-status.enum";
import { toGender } from "@/backend/enum/users/gender.enum";
import { toUserRole } from "@/backend/enum/users/user-role.enum";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import {
  AdminUserGovernanceFilterPothosEnum,
  ApplicantStatusPothosEnum,
  GenderPothosEnum,
  RegisterPublicRolePothosEnum,
  UserRolePothosEnum,
} from "@/backend/graphql/pothos/shared/enum.pothos";
import { ApplicantProfilePothosObject } from "@/backend/graphql/pothos/teachers/applicant.pothos";
import type {
  AdminParentSnapshotReturnType,
  AdminStudentSnapshotReturnType,
  AdminTeacherSnapshotReturnType,
  AdminUserDetailReturnType,
  AdminUserListItemReturnType,
  AdminUserPageReturnType,
} from "@/backend/types";

/**
 * `AdminUserListItem` — one directory row. Exposes the safe `users` columns
 * plus the role-child status headline. `role` is mapped from the raw pgEnum
 * string to the `UserRole` TS enum via `toUserRole` (fail-closed on corrupt
 * stored values — surfaces as a resolver error rather than an unsafe cast).
 */
export const AdminUserListItemPothosObject = gqlSchemaBuilder
  .objectRef<AdminUserListItemReturnType>("AdminUserListItem")
  .implement({
    fields: t => ({
      id: t.exposeInt("id"),
      fullName: t.exposeString("fullName"),
      email: t.exposeString("email"),
      phone: t.exposeString("phone", { nullable: true }),
      role: t.field({
        type: UserRolePothosEnum,
        resolve: parent => {
          const role = toUserRole(parent.role);
          if (role === null) {
            throw new Error(`Unexpected user role: ${parent.role}`);
          }
          return role;
        },
      }),
      country: t.exposeString("country", { nullable: true }),
      gender: t.field({
        type: GenderPothosEnum,
        nullable: true,
        resolve: parent => {
          if (!parent.gender) return null;
          const gender = toGender(parent.gender);
          if (gender === null) {
            throw new Error(`Unexpected user gender: ${parent.gender}`);
          }
          return gender;
        },
      }),
      dateOfBirth: t.exposeString("dateOfBirth", { nullable: true }),
      isDeleted: t.field({ type: "Boolean", resolve: parent => parent.isDeleted }),
      suspended: t.field({ type: "Boolean", resolve: parent => parent.suspended }),
      isBlocked: t.field({ type: "Boolean", resolve: parent => parent.isBlocked }),
      lastActiveAt: t.field({
        type: "String",
        nullable: true,
        resolve: parent => (parent.lastActiveAt ? parent.lastActiveAt.toISOString() : null),
      }),
      createdAt: t.field({
        type: "String",
        resolve: parent => parent.createdAt.toISOString(),
      }),
      applicantStatus: t.field({
        type: ApplicantStatusPothosEnum,
        nullable: true,
        resolve: parent => {
          if (!parent.applicantStatus) return null;
          if (!isApplicantStatus(parent.applicantStatus)) {
            throw new Error(`Unexpected applicant status: ${String(parent.applicantStatus)}`);
          }
          return parent.applicantStatus;
        },
      }),
      teacherIsApproved: t.exposeBoolean("teacherIsApproved", { nullable: true }),
      teacherIsEvaluator: t.exposeBoolean("teacherIsEvaluator", { nullable: true }),
      studentHasParentLink: t.exposeBoolean("studentHasParentLink", { nullable: true }),
      studentHasActiveSubscription: t.exposeBoolean("studentHasActiveSubscription", { nullable: true }),
      parentLinkedChildrenCount: t.exposeInt("parentLinkedChildrenCount", { nullable: true }),
    }),
  });

/**
 * `AdminUserPage` — paginated directory envelope. Echoes `page` + `pageSize`
 * so callers can normalize client-side pagination state; an out-of-range page
 * yields an empty `items` array with the honest `totalCount` (never clamped,
 * never an error).
 */
export const AdminUserPagePothosObject = gqlSchemaBuilder
  .objectRef<AdminUserPageReturnType>("AdminUserPage")
  .implement({
    fields: t => ({
      items: t.field({
        type: [AdminUserListItemPothosObject],
        resolve: parent => parent.items,
      }),
      totalCount: t.exposeInt("totalCount"),
      page: t.exposeInt("page"),
      pageSize: t.exposeInt("pageSize"),
    }),
  });

/**
 * `AdminTeacherSnapshot` — read-only projection of the `teacher` child row
 * when one exists. Teacher-applicants (no `teacher` row yet) yield `null` at
 * the detail composition site.
 */
export const AdminTeacherSnapshotPothosObject = gqlSchemaBuilder
  .objectRef<AdminTeacherSnapshotReturnType>("AdminTeacherSnapshot")
  .implement({
    fields: t => ({
      isApproved: t.field({ type: "Boolean", resolve: parent => parent.isApproved }),
      isEvaluator: t.field({ type: "Boolean", resolve: parent => parent.isEvaluator }),
      isOnline: t.field({ type: "Boolean", resolve: parent => parent.isOnline }),
      averageRating: t.exposeString("averageRating", { nullable: true }),
    }),
  });

/**
 * `AdminStudentSnapshot` — read-only projection of the `students` child row.
 * Balance fields are pure reads; this surface ships NO mutation that touches
 * them.
 */
export const AdminStudentSnapshotPothosObject = gqlSchemaBuilder
  .objectRef<AdminStudentSnapshotReturnType>("AdminStudentSnapshot")
  .implement({
    fields: t => ({
      handshakeCode: t.exposeString("handshakeCode"),
      parentId: t.exposeInt("parentId", { nullable: true }),
      primaryLanguage: t.exposeString("primaryLanguage", { nullable: true }),
      anotherLanguage: t.exposeString("anotherLanguage", { nullable: true }),
      hasParentLink: t.field({ type: "Boolean", resolve: parent => parent.hasParentLink }),
      hasActiveSubscription: t.field({ type: "Boolean", resolve: parent => parent.hasActiveSubscription }),
      balanceHifz: t.exposeInt("balanceHifz", { nullable: true }),
      balanceTajweed: t.exposeInt("balanceTajweed", { nullable: true }),
      balanceReviews: t.exposeInt("balanceReviews", { nullable: true }),
      balanceTrial: t.exposeInt("balanceTrial", { nullable: true }),
      trialGrantedAt: t.field({
        type: "String",
        nullable: true,
        resolve: parent => (parent.trialGrantedAt ? parent.trialGrantedAt.toISOString() : null),
      }),
    }),
  });

/**
 * `AdminParentSnapshot` — read-only projection of the `parents` child row.
 * The headline is the linked-children count.
 */
export const AdminParentSnapshotPothosObject = gqlSchemaBuilder
  .objectRef<AdminParentSnapshotReturnType>("AdminParentSnapshot")
  .implement({
    fields: t => ({
      linkedChildrenCount: t.exposeInt("linkedChildrenCount"),
    }),
  });

/**
 * `AdminUserDetail` — full profile plus resolved role-child state. Extends
 * the safe `users` shape; the role-child slots are independently nullable.
 * The `applicant` slot reuses the canonical `ApplicantProfilePothosObject`
 * (composition-only — never re-declared).
 */
export const AdminUserDetailPothosObject = gqlSchemaBuilder
  .objectRef<AdminUserDetailReturnType>("AdminUserDetail")
  .implement({
    fields: t => ({
      id: t.exposeInt("id"),
      fullName: t.exposeString("fullName"),
      email: t.exposeString("email"),
      phone: t.exposeString("phone", { nullable: true }),
      role: t.field({
        type: UserRolePothosEnum,
        resolve: parent => {
          const role = toUserRole(parent.role);
          if (role === null) {
            throw new Error(`Unexpected user role: ${parent.role}`);
          }
          return role;
        },
      }),
      dateOfBirth: t.exposeString("dateOfBirth", { nullable: true }),
      gender: t.field({
        type: GenderPothosEnum,
        nullable: true,
        resolve: parent => {
          if (!parent.gender) return null;
          const gender = toGender(parent.gender);
          if (gender === null) {
            throw new Error(`Unexpected user gender: ${parent.gender}`);
          }
          return gender;
        },
      }),
      country: t.exposeString("country", { nullable: true }),
      isDeleted: t.field({ type: "Boolean", nullable: true, resolve: parent => parent.isDeleted ?? false }),
      deletedAt: t.field({
        type: "String",
        nullable: true,
        resolve: parent => (parent.deletedAt ? parent.deletedAt.toISOString() : null),
      }),
      suspended: t.field({ type: "Boolean", nullable: true, resolve: parent => parent.suspended ?? false }),
      suspendedAt: t.field({
        type: "String",
        nullable: true,
        resolve: parent => (parent.suspendedAt ? parent.suspendedAt.toISOString() : null),
      }),
      suspendedPeriodDays: t.exposeInt("suspendedPeriodDays", { nullable: true }),
      isBlocked: t.field({ type: "Boolean", nullable: true, resolve: parent => parent.isBlocked ?? false }),
      blockedAt: t.field({
        type: "String",
        nullable: true,
        resolve: parent => (parent.blockedAt ? parent.blockedAt.toISOString() : null),
      }),
      lastActiveAt: t.field({
        type: "String",
        nullable: true,
        resolve: parent => (parent.lastActiveAt ? parent.lastActiveAt.toISOString() : null),
      }),
      createdAt: t.field({
        type: "String",
        resolve: parent => parent.createdAt.toISOString(),
      }),
      updatedAt: t.field({
        type: "String",
        resolve: parent => parent.updatedAt.toISOString(),
      }),
      applicant: t.field({
        type: ApplicantProfilePothosObject,
        nullable: true,
        resolve: parent => parent.applicant,
      }),
      teacher: t.field({
        type: AdminTeacherSnapshotPothosObject,
        nullable: true,
        resolve: parent => parent.teacher,
      }),
      student: t.field({
        type: AdminStudentSnapshotPothosObject,
        nullable: true,
        resolve: parent => parent.student,
      }),
      parent: t.field({
        type: AdminParentSnapshotPothosObject,
        nullable: true,
        resolve: parent => parent.parent,
      }),
    }),
  });

/**
 * `AdminUserFiltersInput` — independent ANDed filters for the directory
 * listing. Absent or `null` members drop out at the service layer; a
 * transport-tampered `governance` value that is not a recognized enum member
 * fails GraphQL input validation before any resolver runs.
 */
export const AdminUserFiltersInput = gqlSchemaBuilder.inputType("AdminUserFiltersInput", {
  fields: t => ({
    role: t.field({ type: UserRolePothosEnum, required: false }),
    governance: t.field({ type: AdminUserGovernanceFilterPothosEnum, required: false }),
    country: t.string({ required: false }),
    search: t.string({ required: false }),
  }),
});

/**
 * `AdminCreateUserInput` — closed whitelist mirroring the public registration
 * shape minus server-controlled fields. `role` uses
 * `RegisterPublicRolePothosEnum` (student/teacher/parent — `admin`
 * structurally excluded at the schema layer; BFLA).
 */
export const AdminCreateUserInput = gqlSchemaBuilder.inputType("AdminCreateUserInput", {
  fields: t => ({
    fullName: t.string({ required: true }),
    email: t.string({ required: true }),
    phone: t.string({ required: true }),
    password: t.string({ required: true }),
    gender: t.field({ type: GenderPothosEnum, required: false }),
    country: t.string({ required: true }),
    role: t.field({ type: RegisterPublicRolePothosEnum, required: true }),
  }),
});

/**
 * `AdminUpdateUserInput` — closed whitelist of EXACTLY five keys
 * (`fullName`, `phone`, `country`, `gender`, `dateOfBirth`). `email`, `role`,
 * `passwordHash`, governance fields, `parentId`, handshake code, balances,
 * and timestamps are structurally unreachable through this shape.
 */
export const AdminUpdateUserInput = gqlSchemaBuilder.inputType("AdminUpdateUserInput", {
  fields: t => ({
    fullName: t.string({ required: false }),
    phone: t.string({ required: false }),
    country: t.string({ required: false }),
    gender: t.field({ type: GenderPothosEnum, required: false }),
    dateOfBirth: t.string({ required: false }),
  }),
});
