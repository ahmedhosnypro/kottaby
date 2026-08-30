/**
 * UserPothosObject — the single canonical GraphQL object type for `User`.
 *
 * Per `backend/graphql/AGENTS.md` (Single Canonical Object Type Pattern):
 *  - Uses `RegistrationReturnType` from `@/backend/types` as the underlying
 *    type reference (NOT a local type definition).
 *  - Backed by `gqlSchemaBuilder.objectRef<RegistrationReturnType>("User")`.
 *  - Exposes `id` (Int — Apollo cache normalization), `email`, `fullName`,
 *    `role`, plus the profile-page fields (`phone`, `country`, `gender`,
 *    `locale`) and the read-only governance fields (`isDeleted`,
 *    `suspended`, `isBlocked`). The `passwordHash` field is structurally
 *    omitted from `RegistrationReturnType` so it can never leak.
 *
 * Additional fields (relationships, computed props) may be added on this same
 * object in future tickets — GraphQL's selection mechanism lets clients
 * request only what they need.
 */
import { toAppLocale } from "@/backend/enum/users/app-locale.enum";
import { toGender } from "@/backend/enum/users/gender.enum";
import { toUserRole } from "@/backend/enum/users/user-role.enum";
import { gqlSchemaBuilder } from "@/backend/graphql/pothos/builder";
import {
  AppLocalePothosEnum,
  GenderPothosEnum,
  RecitationReadingPothosEnum,
  UserRolePothosEnum,
} from "@/backend/graphql/pothos/shared/enum.pothos";
import { ValidationError } from "@/backend/lib/errors";
import type { RegistrationReturnType } from "@/backend/types";

/**
 * The canonical `User` GraphQL object. Resolvers return
 * `RegistrationReturnType` (a `UserSelectType` with `passwordHash` stripped +
 * `preferredRecitation` attached).
 */
export const UserPothosObject = gqlSchemaBuilder.objectRef<RegistrationReturnType>("User").implement({
  fields: t => ({
    // Int ID — Apollo cache normalization requires `id` on every object.
    id: t.exposeInt("id"),
    email: t.exposeString("email"),
    fullName: t.exposeString("fullName"),
    // Nullable — phone is optional in the schema.
    phone: t.exposeString("phone", { nullable: true }),
    // Nullable — country is optional in the schema.
    country: t.exposeString("country", { nullable: true }),
    // Nullable — locale is optional in the schema (unset until the user
    // explicitly picks one; registration leaves it null by the D2 deferred
    // decision). Same shape as `gender`: a closed pgEnum surfaced through
    // the shared Pothos enum registry + the `toAppLocale` safe mapper.
    locale: t.field({
      type: AppLocalePothosEnum,
      nullable: true,
      resolve: async (parent, _args, ctx) => {
        if (!parent.locale) return null;
        const locale = toAppLocale(parent.locale);
        if (locale === null) {
          // Fail-closed deny on a corrupt stored enum (the applicantStatusCorrupt
          // precedent) — translated per the resolver-i18n rule via ctx.t.
          const tErrors = await ctx.t("errorsTranslations");
          throw new ValidationError("USER_LOCALE_CORRUPT", tErrors.userLocaleCorrupt);
        }
        return locale;
      },
    }),
    // Nullable — gender is optional in the schema.
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
    role: t.field({
      type: UserRolePothosEnum,
      // `RegistrationReturnType.role` is the `userRole` pgEnum string union
      // ("admin" | "teacher" | "student" | "parent"); map to the `UserRole`
      // TS enum for Pothos's `ValuesFromEnum` slot. Runtime-equivalent.
      // Uses the shared `toUserRole` helper so an unexpected value surfaces
      // as a resolver error rather than an unsafe cast.
      resolve: parent => {
        const role = toUserRole(parent.role);
        if (role === null) {
          throw new Error(`Unexpected user role: ${parent.role}`);
        }
        return role;
      },
    }),
    // Echo the validated preferred recitation reading (contract
    // metadata — NOT persisted to the `recitation` table). Nullable: null when
    // the user didn't select a reading during registration.
    preferredRecitation: t.field({
      type: RecitationReadingPothosEnum,
      nullable: true,
      description:
        "The user's preferred recitation reading (Qira'ah), selected during registration. Contract metadata — not persisted to the session-linked `recitation` table (C.5).",
      resolve: parent => parent.preferredRecitation ?? null,
    }),
    // Read-only governance fields — exposed so the profile page can show
    // account status badges. These are server-controlled — clients
    // cannot mutate them through any input type. The DB columns are
    // `boolean | null` (Drizzle types them as nullable since they lack
    // `.notNull()`), so we resolve null → false at the GraphQL layer to
    // present a non-nullable Boolean to clients.
    isDeleted: t.boolean({
      resolve: parent => parent.isDeleted ?? false,
    }),
    suspended: t.boolean({
      resolve: parent => parent.suspended ?? false,
    }),
    isBlocked: t.boolean({
      resolve: parent => parent.isBlocked ?? false,
    }),
  }),
});
