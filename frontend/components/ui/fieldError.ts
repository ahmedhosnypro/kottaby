/**
 * Pure projection of GraphQL error `extensions.fields[]` onto MUI `TextField`
 * error props (REQ-015 → REQ-061 UI contract).
 *
 * Layer note: the wire shape mirrors the canonical
 * `ApiFieldErrorType` value object declared in
 * `@/backend/types` (`backend/types/errors/api-error.types.ts`) — that type is
 * NOT imported here because `frontend-no-backend-deps`
 * (`.dependency-cruiser.js`) forbids frontend→backend imports. The local
 * structural mirror keeps this helper layer-pure and trivially unit-testable.
 *
 * Security/UX rules enforced by construction (REQ-033 spirit, applied to the
 * UI boundary):
 *  - EXPLICIT WHITELIST: only `{ field, message }` are read; every other
 *    property on a wire entry (`code`, unknown extras) is dropped. The output
 *    object shape is exactly `{ error, helperText }`.
 *  - NO ECHO: server-controlled non-`message` strings never reach helperText;
 *    malformed entries are skipped, not repaired or surfaced.
 *  - FIRST-WINS: if a field appears more than once, only the first localized
 *    message is kept — a TextField renders exactly one helper line.
 *
 * This module is a pure function layer: no React, no MUI imports, no Apollo —
 * it can be consumed by React Hook Form resolvers, plain forms, and tests.
 */

/**
 * Structural mirror of the canonical field-error contract entry (see
 * `backend/types/errors/api-error.types.ts`, `ApiFieldErrorType`). `code`
 * exists on the wire but is intentionally NOT projected into the UI output
 * below.
 */
export interface FieldErrorContractEntry {
  /** RHF-consumable form path, e.g. `"email"`, `"homeWork.currentGrade"`. */
  readonly field: string;
  /** Localized, user-facing message (REQ-050) — the ONLY echoed string. */
  readonly message: string;
}

/**
 * Spread-ready MUI `TextField` props for one field.
 * When there is no error, `helperText` is `undefined` so spreading does not
 * render an empty helper region (`helperText ?? " "` remains the caller's
 * choice for stable layout).
 */
export interface TextFieldFieldErrorProps {
  readonly error: boolean;
  readonly helperText: string | undefined;
}

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Runtime-narrowing whitelist check for a single untrusted wire entry.
 * Requires a non-empty `field` path and a non-empty, non-blank localized
 * `message`; everything else about the entry is ignored.
 */
export function isProjectableFieldEntry(value: unknown): value is FieldErrorContractEntry {
  return (
    isUnknownRecord(value) &&
    typeof value.field === "string" &&
    value.field.length > 0 &&
    typeof value.message === "string" &&
    value.message.trim().length > 0
  );
}

/**
 * Projects raw `extensions.fields[]` entries into a lookup of TextField error
 * props keyed by form-field path. Untrusted input: invalid entries are
 * silently skipped (never echo their fragments).
 *
 * @example
 * const errors = projectTextFieldErrors(graphQLErrorExtensions.fields);
 * <TextField name="email" {...(errors.email ?? EMPTY_FIELD_ERROR)} />
 */
export function projectTextFieldErrors(
  fields: readonly unknown[] | undefined
): Readonly<Record<string, TextFieldFieldErrorProps>> {
  const projected: Record<string, TextFieldFieldErrorProps> = {};
  for (const entry of fields ?? []) {
    if (!isProjectableFieldEntry(entry)) {
      continue;
    }
    if (projected[entry.field] !== undefined) {
      // First-wins de-duplication — exactly one helper line per field.
      continue;
    }
    projected[entry.field] = { error: true, helperText: entry.message };
  }
  return projected;
}

/** No-error projection — spread-safe placeholder for absent fields. */
export const EMPTY_FIELD_ERROR_PROPS: Readonly<TextFieldFieldErrorProps> = Object.freeze({
  error: false,
  helperText: undefined,
});

/**
 * Single-field variant: TextField props for ONE known field path inside the
 * raw fields array. Absent/invalid ⇒ `{ error: false, helperText: undefined }`.
 */
export function textFieldErrorProps(
  fields: readonly unknown[] | undefined,
  fieldName: string
): TextFieldFieldErrorProps {
  for (const entry of fields ?? []) {
    if (!isProjectableFieldEntry(entry)) {
      continue;
    }
    if (entry.field === fieldName) {
      return { error: true, helperText: entry.message };
    }
  }
  return { ...EMPTY_FIELD_ERROR_PROPS };
}

/**
 * Explicit `aria-invalid` mapping for one field (frontend.instructions.md:
 * `aria-invalid={!!error}` on TextFields with validation errors). MUI's
 * `TextField` already derives `aria-invalid` from its `error` prop; use this
 * helper when wiring raw inputs or asserting accessibility in tests.
 */
export function textFieldAriaInvalid(fields: readonly unknown[] | undefined, fieldName: string): boolean {
  return textFieldErrorProps(fields, fieldName).error;
}
