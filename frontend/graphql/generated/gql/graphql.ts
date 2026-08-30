/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { TypedDocumentNode as DocumentNode } from '@graphql-typed-document-node/core';
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

export type MyHandshakeCodeQuery = { myHandshakeCode: string };


export type MyHandshakeCodeQueryVariables = Exact<{ [key: string]: never; }>;

export type FindStudentByHandshakeCodeQuery_findStudentByHandshakeCode = { maskedName: string, linkable: boolean };

export type FindStudentByHandshakeCodeQuery = { findStudentByHandshakeCode: FindStudentByHandshakeCodeQuery_findStudentByHandshakeCode | null };


export type FindStudentByHandshakeCodeQueryVariables = Exact<{
  code: string;
}>;

export type MyApplicantProfileQuery_myApplicantProfile = { id: number, status: ApplicantStatus, verificationAttempts: number, lastAttemptAt: string | null, cooldownUntil: string | null, cooldownActive: boolean, canPurchaseVerification: boolean };

export type MyApplicantProfileQuery = { myApplicantProfile: MyApplicantProfileQuery_myApplicantProfile | null };


export type MyApplicantProfileQueryVariables = Exact<{ [key: string]: never; }>;


export const RegisterUserDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RegisterUser"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"input"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"RegisterUserInput"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"registerUser"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"input"},"value":{"kind":"Variable","name":{"kind":"Name","value":"input"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"role"}}]}}]}}]} as unknown as DocumentNode<RegisterUserMutation, RegisterUserMutationVariables>;
export const MeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"Me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"me"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"preferredRecitation"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}}]}}]}}]} as unknown as DocumentNode<MeQuery, MeQueryVariables>;
export const LoginDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Login"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"email"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}},{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"password"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"login"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"email"},"value":{"kind":"Variable","name":{"kind":"Name","value":"email"}}},{"kind":"Argument","name":{"kind":"Name","value":"password"},"value":{"kind":"Variable","name":{"kind":"Name","value":"password"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"user"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"email"}},{"kind":"Field","name":{"kind":"Name","value":"fullName"}},{"kind":"Field","name":{"kind":"Name","value":"phone"}},{"kind":"Field","name":{"kind":"Name","value":"country"}},{"kind":"Field","name":{"kind":"Name","value":"gender"}},{"kind":"Field","name":{"kind":"Name","value":"role"}},{"kind":"Field","name":{"kind":"Name","value":"preferredRecitation"}},{"kind":"Field","name":{"kind":"Name","value":"isDeleted"}},{"kind":"Field","name":{"kind":"Name","value":"suspended"}},{"kind":"Field","name":{"kind":"Name","value":"isBlocked"}}]}},{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<LoginMutation, LoginMutationVariables>;
export const RefreshTokenDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"RefreshToken"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"refreshToken"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"refreshToken"},"value":{"kind":"Variable","name":{"kind":"Name","value":"refreshToken"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"accessToken"}},{"kind":"Field","name":{"kind":"Name","value":"refreshToken"}}]}}]}}]} as unknown as DocumentNode<RefreshTokenMutation, RefreshTokenMutationVariables>;
export const LogoutDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"mutation","name":{"kind":"Name","value":"Logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"logout"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"success"}}]}}]}}]} as unknown as DocumentNode<LogoutMutation, LogoutMutationVariables>;
export const RecitationReadingsDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"RecitationReadings"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"recitationReadings"}}]}}]} as unknown as DocumentNode<RecitationReadingsQuery, RecitationReadingsQueryVariables>;
export const MyHandshakeCodeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyHandshakeCode"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myHandshakeCode"}}]}}]} as unknown as DocumentNode<MyHandshakeCodeQuery, MyHandshakeCodeQueryVariables>;
export const FindStudentByHandshakeCodeDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"FindStudentByHandshakeCode"},"variableDefinitions":[{"kind":"VariableDefinition","variable":{"kind":"Variable","name":{"kind":"Name","value":"code"}},"type":{"kind":"NonNullType","type":{"kind":"NamedType","name":{"kind":"Name","value":"String"}}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"findStudentByHandshakeCode"},"arguments":[{"kind":"Argument","name":{"kind":"Name","value":"code"},"value":{"kind":"Variable","name":{"kind":"Name","value":"code"}}}],"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"maskedName"}},{"kind":"Field","name":{"kind":"Name","value":"linkable"}}]}}]}}]} as unknown as DocumentNode<FindStudentByHandshakeCodeQuery, FindStudentByHandshakeCodeQueryVariables>;
export const MyApplicantProfileDocument = {"kind":"Document","definitions":[{"kind":"OperationDefinition","operation":"query","name":{"kind":"Name","value":"MyApplicantProfile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"myApplicantProfile"},"selectionSet":{"kind":"SelectionSet","selections":[{"kind":"Field","name":{"kind":"Name","value":"id"}},{"kind":"Field","name":{"kind":"Name","value":"status"}},{"kind":"Field","name":{"kind":"Name","value":"verificationAttempts"}},{"kind":"Field","name":{"kind":"Name","value":"lastAttemptAt"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownUntil"}},{"kind":"Field","name":{"kind":"Name","value":"cooldownActive"}},{"kind":"Field","name":{"kind":"Name","value":"canPurchaseVerification"}}]}}]}}]} as unknown as DocumentNode<MyApplicantProfileQuery, MyApplicantProfileQueryVariables>;