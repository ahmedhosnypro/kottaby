/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
export type AdminCreateUserInput = {
  country: string;
  email: string;
  fullName: string;
  gender: Gender | null | undefined;
  password: string;
  phone: string;
  role: RegisterPublicRole;
};

export type AdminUpdateUserInput = {
  country: string | null | undefined;
  dateOfBirth: string | null | undefined;
  fullName: string | null | undefined;
  gender: Gender | null | undefined;
  phone: string | null | undefined;
};

export type AdminUserFiltersInput = {
  country: string | null | undefined;
  governance: AdminUserGovernanceFilter | null | undefined;
  role: UserRole | null | undefined;
  search: string | null | undefined;
};

export enum AdminUserGovernanceFilter {
  Active = 'Active',
  Blocked = 'Blocked',
  Deleted = 'Deleted',
  Suspended = 'Suspended'
}

export enum ApplicantStatus {
  Failed = 'Failed',
  InEvaluation = 'InEvaluation',
  Passed = 'Passed',
  Pending = 'Pending'
}

export enum Gender {
  Female = 'Female',
  Male = 'Male',
  Other = 'Other'
}

export enum RecitationReading {
  AlBazziAnIbnKathir = 'AL_BAZZI_AN_IBN_KATHIR',
  AlDuriAnAbiAmr = 'AL_DURI_AN_ABI_AMR',
  AlSusiAnAbiAmr = 'AL_SUSI_AN_ABI_AMR',
  HafsAnAsim = 'HAFS_AN_ASIM',
  KhalafAnHamzah = 'KHALAF_AN_HAMZAH',
  KhalladAnAsim = 'KHALLAD_AN_ASIM',
  QalunAnNafi = 'QALUN_AN_NAFI',
  QunbulAnIbnKathir = 'QUNBUL_AN_IBN_KATHIR',
  ShubahAnAsim = 'SHUBAH_AN_ASIM',
  WarshAnNafi = 'WARSH_AN_NAFI'
}

export enum RegisterPublicRole {
  Parent = 'Parent',
  Student = 'Student',
  Teacher = 'Teacher'
}

export type RegisterUserInput = {
  country: string;
  email: string;
  fullName: string;
  gender: Gender | null | undefined;
  password: string;
  phone: string;
  preferredRecitation: RecitationReading | null | undefined;
  role: RegisterPublicRole;
};

export enum UserRole {
  Admin = 'Admin',
  Parent = 'Parent',
  Student = 'Student',
  Teacher = 'Teacher'
}

export type AdminUserListItemFieldsFragment = { id: number, fullName: string, email: string, phone: string | null, role: UserRole, gender: Gender | null, dateOfBirth: string | null, country: string | null, isDeleted: boolean, suspended: boolean, isBlocked: boolean, lastActiveAt: string | null, createdAt: string, applicantStatus: ApplicantStatus | null, teacherIsApproved: boolean | null, teacherIsEvaluator: boolean | null, studentHasParentLink: boolean | null, studentHasActiveSubscription: boolean | null, parentLinkedChildrenCount: number | null };

export type AdminUserDetailFieldsFragment_applicant = { id: number, status: ApplicantStatus, verificationAttempts: number, lastAttemptAt: string | null, cooldownUntil: string | null, cooldownActive: boolean, canPurchaseVerification: boolean };

export type AdminUserDetailFieldsFragment_teacher = { isApproved: boolean, isEvaluator: boolean, isOnline: boolean, averageRating: string | null };

export type AdminUserDetailFieldsFragment_student = { handshakeCode: string, parentId: number | null, primaryLanguage: string | null, anotherLanguage: string | null, hasParentLink: boolean, hasActiveSubscription: boolean, balanceHifz: number | null, balanceTajweed: number | null, balanceReviews: number | null, balanceTrial: number | null, trialGrantedAt: string | null };

export type AdminUserDetailFieldsFragment_parent = { linkedChildrenCount: number };

export type AdminUserDetailFieldsFragment = { id: number, fullName: string, email: string, phone: string | null, role: UserRole, dateOfBirth: string | null, gender: Gender | null, country: string | null, isDeleted: boolean | null, deletedAt: string | null, suspended: boolean | null, suspendedAt: string | null, suspendedPeriodDays: number | null, isBlocked: boolean | null, blockedAt: string | null, lastActiveAt: string | null, createdAt: string, updatedAt: string, applicant: AdminUserDetailFieldsFragment_applicant | null, teacher: AdminUserDetailFieldsFragment_teacher | null, student: AdminUserDetailFieldsFragment_student | null, parent: AdminUserDetailFieldsFragment_parent | null };

export type AdminUsersQuery_adminUsers_items = { id: number, fullName: string, email: string, phone: string | null, role: UserRole, gender: Gender | null, dateOfBirth: string | null, country: string | null, isDeleted: boolean, suspended: boolean, isBlocked: boolean, lastActiveAt: string | null, createdAt: string, applicantStatus: ApplicantStatus | null, teacherIsApproved: boolean | null, teacherIsEvaluator: boolean | null, studentHasParentLink: boolean | null, studentHasActiveSubscription: boolean | null, parentLinkedChildrenCount: number | null };

export type AdminUsersQuery_adminUsers = { totalCount: number, page: number, pageSize: number, items: Array<AdminUsersQuery_adminUsers_items> };

export type AdminUsersQuery = { adminUsers: AdminUsersQuery_adminUsers };


export type AdminUsersQueryVariables = Exact<{
  filters: AdminUserFiltersInput | null | undefined;
  page: number | null | undefined;
  pageSize: number | null | undefined;
}>;

export type AdminUserDetailQuery_adminUserDetail = { id: number, fullName: string, email: string, phone: string | null, role: UserRole, dateOfBirth: string | null, gender: Gender | null, country: string | null, isDeleted: boolean | null, deletedAt: string | null, suspended: boolean | null, suspendedAt: string | null, suspendedPeriodDays: number | null, isBlocked: boolean | null, blockedAt: string | null, lastActiveAt: string | null, createdAt: string, updatedAt: string, applicant: AdminUserDetailFieldsFragment_applicant | null, teacher: AdminUserDetailFieldsFragment_teacher | null, student: AdminUserDetailFieldsFragment_student | null, parent: AdminUserDetailFieldsFragment_parent | null };

export type AdminUserDetailQuery = { adminUserDetail: AdminUserDetailQuery_adminUserDetail };


export type AdminUserDetailQueryVariables = Exact<{
  id: number;
}>;

export type AdminCreateUserMutation_adminCreateUser = { id: number, fullName: string, email: string, phone: string | null, role: UserRole, dateOfBirth: string | null, gender: Gender | null, country: string | null, isDeleted: boolean | null, deletedAt: string | null, suspended: boolean | null, suspendedAt: string | null, suspendedPeriodDays: number | null, isBlocked: boolean | null, blockedAt: string | null, lastActiveAt: string | null, createdAt: string, updatedAt: string, applicant: AdminUserDetailFieldsFragment_applicant | null, teacher: AdminUserDetailFieldsFragment_teacher | null, student: AdminUserDetailFieldsFragment_student | null, parent: AdminUserDetailFieldsFragment_parent | null };

export type AdminCreateUserMutation = { adminCreateUser: AdminCreateUserMutation_adminCreateUser };


export type AdminCreateUserMutationVariables = Exact<{
  input: AdminCreateUserInput;
}>;

export type AdminUpdateUserMutation_adminUpdateUser = { id: number, fullName: string, email: string, phone: string | null, role: UserRole, dateOfBirth: string | null, gender: Gender | null, country: string | null, isDeleted: boolean | null, deletedAt: string | null, suspended: boolean | null, suspendedAt: string | null, suspendedPeriodDays: number | null, isBlocked: boolean | null, blockedAt: string | null, lastActiveAt: string | null, createdAt: string, updatedAt: string, applicant: AdminUserDetailFieldsFragment_applicant | null, teacher: AdminUserDetailFieldsFragment_teacher | null, student: AdminUserDetailFieldsFragment_student | null, parent: AdminUserDetailFieldsFragment_parent | null };

export type AdminUpdateUserMutation = { adminUpdateUser: AdminUpdateUserMutation_adminUpdateUser };


export type AdminUpdateUserMutationVariables = Exact<{
  id: number;
  input: AdminUpdateUserInput;
}>;

export type AdminSetUserDeletedMutation_adminSetUserDeleted = { id: number, fullName: string, email: string, phone: string | null, role: UserRole, dateOfBirth: string | null, gender: Gender | null, country: string | null, isDeleted: boolean | null, deletedAt: string | null, suspended: boolean | null, suspendedAt: string | null, suspendedPeriodDays: number | null, isBlocked: boolean | null, blockedAt: string | null, lastActiveAt: string | null, createdAt: string, updatedAt: string, applicant: AdminUserDetailFieldsFragment_applicant | null, teacher: AdminUserDetailFieldsFragment_teacher | null, student: AdminUserDetailFieldsFragment_student | null, parent: AdminUserDetailFieldsFragment_parent | null };

export type AdminSetUserDeletedMutation = { adminSetUserDeleted: AdminSetUserDeletedMutation_adminSetUserDeleted };


export type AdminSetUserDeletedMutationVariables = Exact<{
  id: number;
  deleted: boolean;
}>;

export type RegisterUserMutation_registerUser = { id: number, email: string, fullName: string, role: UserRole };

export type RegisterUserMutation = { registerUser: RegisterUserMutation_registerUser };


export type RegisterUserMutationVariables = Exact<{
  input: RegisterUserInput;
}>;

export type MeQuery_me = { id: number, email: string, fullName: string, phone: string | null, country: string | null, gender: Gender | null, role: UserRole, preferredRecitation: RecitationReading | null, isDeleted: boolean, suspended: boolean, isBlocked: boolean };

export type MeQuery = { me: MeQuery_me | null };


export type MeQueryVariables = Exact<{ [key: string]: never; }>;

export type LoginMutation_login_user = { id: number, email: string, fullName: string, phone: string | null, country: string | null, gender: Gender | null, role: UserRole, preferredRecitation: RecitationReading | null, isDeleted: boolean, suspended: boolean, isBlocked: boolean };

export type LoginMutation_login = { accessToken: string, refreshToken: string, user: LoginMutation_login_user };

export type LoginMutation = { login: LoginMutation_login };


export type LoginMutationVariables = Exact<{
  email: string;
  password: string;
}>;

export type RefreshTokenMutation_refreshToken = { accessToken: string, refreshToken: string };

export type RefreshTokenMutation = { refreshToken: RefreshTokenMutation_refreshToken };


export type RefreshTokenMutationVariables = Exact<{
  refreshToken: string;
}>;

export type LogoutMutation_logout = { success: boolean };

export type LogoutMutation = { logout: LogoutMutation_logout };


export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;

export type RecitationReadingsQuery = { recitationReadings: Array<RecitationReading> };


export type RecitationReadingsQueryVariables = Exact<{ [key: string]: never; }>;

export type MyApplicantProfileQuery_myApplicantProfile = { id: number, status: ApplicantStatus, verificationAttempts: number, lastAttemptAt: string | null, cooldownUntil: string | null, cooldownActive: boolean, canPurchaseVerification: boolean };

export type MyApplicantProfileQuery = { myApplicantProfile: MyApplicantProfileQuery_myApplicantProfile | null };


export type MyApplicantProfileQueryVariables = Exact<{ [key: string]: never; }>;

export const AdminUserListItemFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdminUserListItemFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserListItem"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"dateOfBirth"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}},{"kind":"Field","name":{"kind":"Name","value":"lastActiveAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"applicantStatus"}},{"kind":"Field","name":{"kind":"Name","value":"teacherIsApproved"}},{"kind":"Field","name":{"kind":"Name","value":"teacherIsEvaluator"}},{"kind":"Field","name":{"kind":"Name","value":"studentHasParentLink"}},{"kind":"Field","name":{"kind":"Name","value":"studentHasActiveSubscription"}},{"kind":"Field","name":{"kind":"Name","value":"parentLinkedChildrenCount"}}]}}]} as unknown as DocumentNode<AdminUserListItemFieldsFragment, unknown>;
export const AdminUserDetailFieldsFragmentDoc = {"kind":"Document","definitions":[{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdminUserDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserDetail"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"dateOfBirth"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedPeriodDays"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}},{"kind":"Field","name":{"kind":"Name","value":"blockedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastActiveAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"applicant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teacher"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isApproved"}},{"kind":"Field","name":{"kind":"Name","value":"isEvaluator"}},{"kind":"Field","name":{"kind":"Name","value":"isOnline"}},{"kind":"Field","name":{"kind":"Name","value":"averageRating"}}]}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handshakeCode"}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"primaryLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"anotherLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"hasParentLink"}},{"kind":"Field","name":{"kind":"Name","value":"hasActiveSubscription"}},{"kind":"Field","name":{"kind":"Name","value":"balanceHifz"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTajweed"}},{"kind":"Field","name":{"kind":"Name","value":"balanceReviews"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTrial"}},{"kind":"Field","name":{"kind":"Name","value":"trialGrantedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"linkedChildrenCount"}}]}}]}}]} as unknown as DocumentNode<AdminUserDetailFieldsFragment, unknown>;
export const AdminUsersDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AdminUsers"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"filters"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserFiltersInput"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"page"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}},"type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminUsers"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"filters"},"value":{"kind":"Variable","name":{"kind":"Name","value":"filters"}}},{"kind":"Argument","name":{"kind":"Name","value":"page"},"value":{"kind":"Variable","name":{"kind":"Name","value":"page"}}},{"kind":"Argument","name":{"kind":"Name","value":"pageSize"},"value":{"kind":"Variable","name":{"kind":"Name","value":"pageSize"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"items"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AdminUserListItemFields"}}]}},{"kind":"Field","name":{"kind":"Name","value":"totalCount"}},{"kind":"Field","name":{"kind":"Name","value":"page"}},{"kind":"Field","name":{"kind":"Name","value":"pageSize"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdminUserListItemFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserListItem"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"dateOfBirth"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}},{"kind":"Field","name":{"kind":"Name","value":"lastActiveAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"applicantStatus"}},{"kind":"Field","name":{"kind":"Name","value":"teacherIsApproved"}},{"kind":"Field","name":{"kind":"Name","value":"teacherIsEvaluator"}},{"kind":"Field","name":{"kind":"Name","value":"studentHasParentLink"}},{"kind":"Field","name":{"kind":"Name","value":"studentHasActiveSubscription"}},{"kind":"Field","name":{"kind":"Name","value":"parentLinkedChildrenCount"}}]}}]} as unknown as DocumentNode<AdminUsersQuery, AdminUsersQueryVariables>;
export const AdminUserDetailDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"AdminUserDetail"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminUserDetail"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AdminUserDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdminUserDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserDetail"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"dateOfBirth"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedPeriodDays"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}},{"kind":"Field","name":{"kind":"Name","value":"blockedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastActiveAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"applicant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teacher"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isApproved"}},{"kind":"Field","name":{"kind":"Name","value":"isEvaluator"}},{"kind":"Field","name":{"kind":"Name","value":"isOnline"}},{"kind":"Field","name":{"kind":"Name","value":"averageRating"}}]}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handshakeCode"}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"primaryLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"anotherLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"hasParentLink"}},{"kind":"Field","name":{"kind":"Name","value":"hasActiveSubscription"}},{"kind":"Field","name":{"kind":"Name","value":"balanceHifz"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTajweed"}},{"kind":"Field","name":{"kind":"Name","value":"balanceReviews"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTrial"}},{"kind":"Field","name":{"kind":"Name","value":"trialGrantedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"linkedChildrenCount"}}]}}]}}]} as unknown as DocumentNode<AdminUserDetailQuery, AdminUserDetailQueryVariables>;
export const AdminCreateUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AdminCreateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"AdminCreateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminCreateUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AdminUserDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdminUserDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserDetail"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"dateOfBirth"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedPeriodDays"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}},{"kind":"Field","name":{"kind":"Name","value":"blockedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastActiveAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"applicant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teacher"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isApproved"}},{"kind":"Field","name":{"kind":"Name","value":"isEvaluator"}},{"kind":"Field","name":{"kind":"Name","value":"isOnline"}},{"kind":"Field","name":{"kind":"Name","value":"averageRating"}}]}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handshakeCode"}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"primaryLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"anotherLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"hasParentLink"}},{"kind":"Field","name":{"kind":"Name","value":"hasActiveSubscription"}},{"kind":"Field","name":{"kind":"Name","value":"balanceHifz"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTajweed"}},{"kind":"Field","name":{"kind":"Name","value":"balanceReviews"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTrial"}},{"kind":"Field","name":{"kind":"Name","value":"trialGrantedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"linkedChildrenCount"}}]}}]}}]} as unknown as DocumentNode<AdminCreateUserMutation, AdminCreateUserMutationVariables>;
export const AdminUpdateUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AdminUpdateUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUpdateUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminUpdateUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AdminUserDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdminUserDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserDetail"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"dateOfBirth"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedPeriodDays"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}},{"kind":"Field","name":{"kind":"Name","value":"blockedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastActiveAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"applicant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teacher"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isApproved"}},{"kind":"Field","name":{"kind":"Name","value":"isEvaluator"}},{"kind":"Field","name":{"kind":"Name","value":"isOnline"}},{"kind":"Field","name":{"kind":"Name","value":"averageRating"}}]}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handshakeCode"}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"primaryLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"anotherLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"hasParentLink"}},{"kind":"Field","name":{"kind":"Name","value":"hasActiveSubscription"}},{"kind":"Field","name":{"kind":"Name","value":"balanceHifz"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTajweed"}},{"kind":"Field","name":{"kind":"Name","value":"balanceReviews"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTrial"}},{"kind":"Field","name":{"kind":"Name","value":"trialGrantedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"linkedChildrenCount"}}]}}]}}]} as unknown as DocumentNode<AdminUpdateUserMutation, AdminUpdateUserMutationVariables>;
export const AdminSetUserDeletedDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"AdminSetUserDeleted"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"id"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Int"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"deleted"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"Boolean"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"adminSetUserDeleted"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"id"},"value":{"kind":"Variable","name":{"kind":"Name","value":"id"}}},{"kind":"Argument","name":{"kind":"Name","value":"deleted"},"value":{"kind":"Variable","name":{"kind":"Name","value":"deleted"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"FragmentSpread","name":{"kind":"Name","value":"AdminUserDetailFields"}}]}}]}},{"kind":"FragmentDefinition","name":{"kind":"Name","value":"AdminUserDetailFields"},"typeCondition":{"kind":"NamedType","name":{"kind":"Name","value":"AdminUserDetail"}},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"dateOfBirth"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"deletedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedAt"}},{"kind":"Field","name":{"kind":"Name","value":"suspendedPeriodDays"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}},{"kind":"Field","name":{"kind":"Name","value":"blockedAt"}},{"kind":"Field","name":{"kind":"Name","value":"lastActiveAt"}},{"kind":"Field","name":{"kind":"Name","value":"createdAt"}},{"kind":"Field","name":{"kind":"Name","value":"updatedAt"}},{"kind":"Field","name":{"kind":"Name","value":"applicant"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}},{"kind":"Field","name":{"kind":"Name","value":"teacher"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"isApproved"}},{"kind":"Field","name":{"kind":"Name","value":"isEvaluator"}},{"kind":"Field","name":{"kind":"Name","value":"isOnline"}},{"kind":"Field","name":{"kind":"Name","value":"averageRating"}}]}},{"kind":"Field","name":{"kind":"Name","value":"student"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"handshakeCode"}},{"kind":"Field","name":{"kind":"Name","value":"parentId"}},{"kind":"Field","name":{"kind":"Name","value":"primaryLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"anotherLanguage"}},{"kind":"Field","name":{"kind":"Name","value":"hasParentLink"}},{"kind":"Field","name":{"kind":"Name","value":"hasActiveSubscription"}},{"kind":"Field","name":{"kind":"Name","value":"balanceHifz"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTajweed"}},{"kind":"Field","name":{"kind":"Name","value":"balanceReviews"}},{"kind":"Field","name":{"kind":"Name","value":"balanceTrial"}},{"kind":"Field","name":{"kind":"Name","value":"trialGrantedAt"}}]}},{"kind":"Field","name":{"kind":"Name","value":"parent"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"linkedChildrenCount"}}]}}]}}]} as unknown as DocumentNode<AdminSetUserDeletedMutation, AdminSetUserDeletedMutationVariables>;
export const RegisterUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RegisterUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RegisterUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"registerUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}}]}}]} as unknown as DocumentNode<RegisterUserMutation, RegisterUserMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"preferredRecitation"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const LoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Login"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"preferredRecitation"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}}]}},{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const RefreshTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RefreshToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"refreshToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"refreshToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<RefreshTokenMutation, RefreshTokenMutationVariables>;
export const LogoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"success"}}]}}]}}]} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const RecitationReadingsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RecitationReadings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recitationReadings"}}]}}]} as unknown as DocumentNode<RecitationReadingsQuery, RecitationReadingsQueryVariables>;
export const MyApplicantProfileDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyApplicantProfile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myApplicantProfile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}}]}}]} as unknown as DocumentNode<MyApplicantProfileQuery, MyApplicantProfileQueryVariables>;