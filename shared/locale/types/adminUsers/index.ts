/**
 * `adminUsers` namespace labels — admin user-management directory, detail
 * surface, and create/edit/delete/reactivate dialog chrome copy.
 *
 * Used by:
 *  - Frontend `AdminUsersDirectoryContainer` (`useAppTranslation(AdminUsers)`)
 *    for the directory page heading, table headers, status/role chips, filter
 *    bar labels, empty/error states, and the create/edit/delete/reactivate
 *    dialog copy.
 *  - Frontend `AdminUserDetailContainer` (`useAppTranslation(AdminUsers)`) for
 *    the detail page heading, role-child section headings, and the
 *    not-found section rendered when the targeted id has no row.
 *
 * Scope: chrome copy only — admin-authored DATA (full names, email addresses,
 * phone numbers, country names, dates) is rendered verbatim and is NEVER
 * translated. No ICU placeholders are used because no localized string
 * interpolates admin-authored or system-supplied values; interpolated rows
 * are produced by composing label + verbatim data inside the component.
 *
 * All keys MUST have both `en` and `ar` implementations with EXACT key-set
 * parity (compile-typed on both leaves — the primary parity gate is the
 * `Translations` interface where both leaf consts are typed
 * `AdminUsersLabels`; the runtime parity suites walk grouped sub-block leaves
 * depth-first so the zero-dead-key discipline stays enforced for nested
 * blocks). Property access only — never call-by-key.
 */
export interface AdminUsersLabels {
  /** Directory page heading shown in the page header band. */
  readonly title: string;
  /** Detail page heading shown in the page header band. */
  readonly detailTitle: string;

  /** Table column headers shown in the admin user directory table. */
  readonly headers: {
    /** Header cell for the user's full name column. */
    readonly name: string;
    /** Header cell for the user's email column. */
    readonly email: string;
    /** Header cell for the user's role column. */
    readonly role: string;
    /** Header cell for the user's country column. */
    readonly country: string;
    /** Header cell for the governance status column. */
    readonly status: string;
    /** Header cell for the last-active timestamp column. */
    readonly lastActive: string;
    /** Header cell for the account-creation timestamp column. */
    readonly createdAt: string;
    /** Header cell for the row actions column (edit / delete / reactivate). */
    readonly actions: string;
  };

  /** Governance status badge labels rendered next to each directory row. */
  readonly statusBadges: {
    /** Badge for an active (non-deleted, non-suspended, non-blocked) account. */
    readonly active: string;
    /** Badge for a suspended account. */
    readonly suspended: string;
    /** Badge for a blocked account. */
    readonly blocked: string;
    /** Badge for a soft-deleted account. */
    readonly deleted: string;
  };

  /** Role labels rendered as chips inside the role column. */
  readonly roleLabels: {
    /** Role chip for a super-admin account. */
    readonly admin: string;
    /** Role chip for a teacher account. */
    readonly teacher: string;
    /** Role chip for a student account. */
    readonly student: string;
    /** Role chip for a parent account. */
    readonly parent: string;
  };

  /** Filter bar control labels and the search input placeholder. */
  readonly filters: {
    /** Label for the role filter select. */
    readonly role: string;
    /** Label for the governance filter select. */
    readonly governance: string;
    /** Label for the country filter select. */
    readonly country: string;
    /** Accessible label for the search input. */
    readonly search: string;
    /** Placeholder shown inside an empty search input. */
    readonly searchPlaceholder: string;
    /** "Clear filters" button — restores the directory to its unfiltered state. */
    readonly clear: string;
  };

  /** Empty-state copy rendered inside the table body when no rows match. */
  readonly emptyState: {
    /** Empty-state heading line — shown when no users exist at all. */
    readonly title: string;
    /** Empty-state body line explaining why no rows are visible (zero users). */
    readonly message: string;
    /** Call-to-action button label for the empty state. */
    readonly cta: string;
    /** Empty-state heading line — shown when filters returned zero matches. */
    readonly filteredTitle: string;
    /** Empty-state body explaining filters narrowed the result set to zero. */
    readonly filteredMessage: string;
  };

  /** Error-state copy rendered when the directory query fails. */
  readonly errorState: {
    /** Error-state heading line. */
    readonly title: string;
    /** Error-state body line explaining the failure. */
    readonly message: string;
    /** Retry button label for the error state. */
    readonly retry: string;
  };

  /** Gender option labels shared by the create/edit dialog gender select. */
  readonly genderOptions: {
    /** Select-option label for the empty (unspecified) gender entry. */
    readonly unspecified: string;
    /** Select-option label for the `Male` gender enum value. */
    readonly male: string;
    /** Select-option label for the `Female` gender enum value. */
    readonly female: string;
    /** Select-option label for the `Other` gender enum value. */
    readonly other: string;
  };

  /** Create-user dialog field labels, button labels, and dialog title. */
  readonly createDialog: {
    /** Dialog title for the create-user dialog. */
    readonly title: string;
    /** Field label for the full name input. */
    readonly fullName: string;
    /** Field label for the email input. */
    readonly email: string;
    /** Field label for the phone input. */
    readonly phone: string;
    /** Field label for the initial password input. */
    readonly password: string;
    /** Field label for the gender select. */
    readonly gender: string;
    /** Field label for the country select. */
    readonly country: string;
    /** Field label for the role select. */
    readonly role: string;
    /** Submit button label for the create dialog. */
    readonly submit: string;
    /** Cancel button label for the create dialog. */
    readonly cancel: string;
  };

  /** Edit-user dialog field labels, button labels, and dialog title. */
  readonly editDialog: {
    /** Dialog title for the edit-user dialog. */
    readonly title: string;
    /** Field label for the full name input. */
    readonly fullName: string;
    /** Field label for the phone input. */
    readonly phone: string;
    /** Field label for the country select. */
    readonly country: string;
    /** Field label for the gender select. */
    readonly gender: string;
    /** Field label for the date-of-birth input. */
    readonly dateOfBirth: string;
    /** Submit button label for the edit dialog. */
    readonly submit: string;
    /** Cancel button label for the edit dialog. */
    readonly cancel: string;
  };

  /** Soft-delete confirm dialog copy. */
  readonly deleteConfirm: {
    /** Dialog title for the soft-delete confirm dialog. */
    readonly title: string;
    /** Body copy explaining the action being confirmed. */
    readonly message: string;
    /** Secondary consequences line listing what survives the soft-delete. */
    readonly consequences: string;
    /** Confirm button label for the soft-delete dialog. */
    readonly confirm: string;
    /** Cancel button label for the soft-delete dialog. */
    readonly cancel: string;
  };

  /** Reactivate confirm dialog copy. */
  readonly reactivateConfirm: {
    /** Dialog title for the reactivate confirm dialog. */
    readonly title: string;
    /** Body copy explaining the action being confirmed. */
    readonly message: string;
    /** Confirm button label for the reactivate dialog. */
    readonly confirm: string;
    /** Cancel button label for the reactivate dialog. */
    readonly cancel: string;
  };

  /** Detail page section headings and navigation affordances. */
  readonly detail: {
    /** Section heading for the profile card (full name, email, phone, etc.). */
    readonly profile: string;
    /** Section heading for the governance card (status, suspension/block dates). */
    readonly governance: string;
    /** Section heading for the applicant role-child snapshot card. */
    readonly applicant: string;
    /** Section heading for the teacher role-child snapshot card. */
    readonly teacher: string;
    /** Section heading for the student role-child snapshot card. */
    readonly student: string;
    /** Section heading for the parent role-child snapshot card. */
    readonly parent: string;
    /** Back-to-directory button label on the detail page. */
    readonly backToDirectory: string;
    /** Not-found section title rendered when the targeted id has no row. */
    readonly notFoundTitle: string;
    /** Not-found section body explaining the row is gone or never existed. */
    readonly notFoundMessage: string;
    /** Inline edit action button on the detail page header. */
    readonly editAction: string;
    /** Inline soft-delete action button on the detail page header. */
    readonly deleteAction: string;
    /** Inline reactivate action button on the detail page header. */
    readonly reactivateAction: string;
    /** Field label for the soft-deletion timestamp on the governance card. */
    readonly deletedAt: string;
    /** Field label for the suspension timestamp on the governance card. */
    readonly suspendedAt: string;
    /** Field label for the block timestamp on the governance card. */
    readonly blockedAt: string;
    /** Field labels for the applicant role-child snapshot card. */
    readonly applicantFields: {
      readonly status: string;
      readonly verificationAttempts: string;
      readonly lastAttempt: string;
      readonly cooldownUntil: string;
      readonly cooldownActive: string;
      readonly canPurchaseVerification: string;
    };
    /** Localized display values for the `ApplicantStatus` enum. */
    readonly applicantStatus: {
      readonly pending: string;
      readonly inEvaluation: string;
      readonly passed: string;
      readonly failed: string;
    };
    /** Field labels for the teacher role-child snapshot card. */
    readonly teacherFields: {
      readonly approved: string;
      readonly evaluator: string;
      readonly online: string;
      readonly averageRating: string;
    };
    /** Field labels for the student role-child snapshot card. */
    readonly studentFields: {
      readonly handshakeCode: string;
      readonly hasParentLink: string;
      readonly parentId: string;
      readonly hasActiveSubscription: string;
      readonly balanceHifz: string;
      readonly balanceTajweed: string;
      readonly balanceReviews: string;
      readonly trialGrantedAt: string;
    };
    /** Field labels for the parent role-child snapshot card. */
    readonly parentFields: {
      readonly linkedChildrenCount: string;
    };
    /** Localized Yes/No labels for boolean field display. */
    readonly booleanValues: {
      readonly yes: string;
      readonly no: string;
    };
  };

  /**
   * Self-deactivation alert rendered inside the soft-delete confirm dialog
   * when the admin targets their own account. The operation is rejected
   * before any write; this alert explains why the confirm button is disabled.
   */
  readonly selfDeactivationAlert: {
    /** Alert title for the self-deactivation guard. */
    readonly title: string;
    /** Alert body explaining the rule. */
    readonly message: string;
  };

  /** Mutation-success snackbar copy rendered after a successful write. */
  readonly snackbars: {
    /** Snackbar copy rendered after a successful create. */
    readonly created: string;
    /** Snackbar copy rendered after a successful update. */
    readonly updated: string;
    /** Snackbar copy rendered after a successful soft-delete. */
    readonly deleted: string;
    /** Snackbar copy rendered after a successful reactivation. */
    readonly reactivated: string;
  };

  /** Pagination control labels and counters. */
  readonly pagination: {
    /** "Page" word in the page-of-total counter. */
    readonly page: string;
    /** "of" word in the page-of-total counter. */
    readonly of: string;
    /** "Total" word on the total-count row. */
    readonly total: string;
    /** Next-page button label. */
    readonly next: string;
    /** Previous-page button label. */
    readonly previous: string;
    /** Page-size selector label. */
    readonly pageSize: string;
  };
}
