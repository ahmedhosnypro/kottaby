/**
 * Admin user GraphQL documents — directory, detail, create, update,
 * soft-delete/reactivate.
 *
 * Per `frontend/graphql/sharedDocuments/AGENTS.md`:
 *  - All documents use `gql` + `TypedDocumentNode` (codegen types only).
 *  - `id` is selected FIRST in every object (Apollo cache normalization).
 *  - Hooks consumed from `@apollo/client/react` in views:
 *    `useQuery`/`useMutation` ONLY — NO `useLazyQuery`.
 *  - Variables are typed, never string-interpolated.
 *  - No sensitive field (`passwordHash`) is ever selected.
 */
import { gql, type TypedDocumentNode } from "@apollo/client";
import type {
  AdminCreateUserMutation,
  AdminSetUserDeletedMutation,
  AdminUpdateUserMutation,
  AdminUserDetailQuery,
  AdminUserStatsQuery,
  AdminUsersQuery,
} from "@/frontend/graphql/generated/gql/graphql";

/** Shared list-item fragment for the directory + create/update/delete refetches. */
const ADMIN_USER_LIST_ITEM_FIELDS = gql`
  fragment AdminUserListItemFields on AdminUserListItem {
    id
    fullName
    email
    phone
    role
    gender
    dateOfBirth
    country
    isDeleted
    suspended
    isBlocked
    lastActiveAt
    createdAt
    applicantStatus
    teacherIsApproved
    teacherIsEvaluator
    studentHasParentLink
    studentHasActiveSubscription
    parentLinkedChildrenCount
  }
`;

/** Shared detail fragment for the detail page + post-mutation refetches. */
const ADMIN_USER_DETAIL_FIELDS = gql`
  fragment AdminUserDetailFields on AdminUserDetail {
    id
    fullName
    email
    phone
    role
    dateOfBirth
    gender
    country
    isDeleted
    deletedAt
    suspended
    suspendedAt
    suspendedPeriodDays
    isBlocked
    blockedAt
    lastActiveAt
    createdAt
    updatedAt
    applicant {
      id
      status
      verificationAttempts
      lastAttemptAt
      cooldownUntil
      cooldownActive
      canPurchaseVerification
    }
    teacher {
      isApproved
      isEvaluator
      isOnline
      averageRating
    }
    student {
      handshakeCode
      parentId
      primaryLanguage
      anotherLanguage
      hasParentLink
      hasActiveSubscription
      balanceHifz
      balanceTajweed
      balanceReviews
      balanceTrial
      trialGrantedAt
    }
    parent {
      linkedChildrenCount
    }
  }
`;

/** Directory query — paginated, filterable. */
export const adminUsersQueryDocument: TypedDocumentNode<AdminUsersQuery> = gql`
  ${ADMIN_USER_LIST_ITEM_FIELDS}
  query AdminUsers($filters: AdminUserFiltersInput, $page: Int, $pageSize: Int) {
    adminUsers(filters: $filters, page: $page, pageSize: $pageSize) {
      items {
        ...AdminUserListItemFields
      }
      totalCount
      page
      pageSize
    }
  }
`;

/**
 * Overview-stats query — directory-wide aggregate counters (governance +
 * role + trailing-7-day signups) powering the clickable stat cards above
 * the directory table. Scalar-only envelope: no object selections, so no
 * `id` normalization requirement applies.
 */
export const adminUserStatsQueryDocument: TypedDocumentNode<AdminUserStatsQuery> = gql`
  query AdminUserStats {
    adminUserStats {
      totalCount
      activeCount
      suspendedCount
      blockedCount
      deletedCount
      adminsCount
      teachersCount
      studentsCount
      parentsCount
      newThisWeekCount
    }
  }
`;

/** Single-user detail query. */
export const adminUserDetailQueryDocument: TypedDocumentNode<AdminUserDetailQuery> = gql`
  ${ADMIN_USER_DETAIL_FIELDS}
  query AdminUserDetail($id: Int!) {
    adminUserDetail(id: $id) {
      ...AdminUserDetailFields
    }
  }
`;

/** Create-user mutation — returns the new user's detail. */
export const adminCreateUserMutationDocument: TypedDocumentNode<AdminCreateUserMutation> = gql`
  ${ADMIN_USER_DETAIL_FIELDS}
  mutation AdminCreateUser($input: AdminCreateUserInput!) {
    adminCreateUser(input: $input) {
      ...AdminUserDetailFields
    }
  }
`;

/** Whitelist profile-patch mutation — returns the post-write detail. */
export const adminUpdateUserMutationDocument: TypedDocumentNode<AdminUpdateUserMutation> = gql`
  ${ADMIN_USER_DETAIL_FIELDS}
  mutation AdminUpdateUser($id: Int!, $input: AdminUpdateUserInput!) {
    adminUpdateUser(id: $id, input: $input) {
      ...AdminUserDetailFields
    }
  }
`;

/** Soft-delete / reactivate mutation — returns the post-write detail. */
export const adminSetUserDeletedMutationDocument: TypedDocumentNode<AdminSetUserDeletedMutation> = gql`
  ${ADMIN_USER_DETAIL_FIELDS}
  mutation AdminSetUserDeleted($id: Int!, $deleted: Boolean!) {
    adminSetUserDeleted(id: $id, deleted: $deleted) {
      ...AdminUserDetailFields
    }
  }
`;
