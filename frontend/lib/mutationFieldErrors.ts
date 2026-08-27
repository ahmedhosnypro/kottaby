/**
 * Form-bound projection of Apollo mutation failures into RHF
 * `setError(field, { message })` pairs (dev3-002 Task 4.3, REQ-015 → REQ-061).
 *
 * WHY THIS EXISTS
 *   Task 4.1's ErrorLink dispatcher (`frontend/providers/apollo/utils.ts`)
 *   cannot see React form state and always publishes with `hasForm:false`.
 *   Its documented adoption protocol (outcome/4.1 §7.3) says a form-bound
 *   consumer converts the `fieldErrors` pairs attached to the VALIDATION rows
 *   into field-level errors locally. This module IS that form-bound seam for
 *   mutation forms: it walks an unknown Apollo error's cause chain, finds
 *   `extensions.code` + `extensions.fields[]` carriers, re-runs them through
 *   the SAME pure REQ-061 table with `hasForm:true` / `contextKind:"mutation"`
 *   (the direct-call variant — the single-slot
 *   `registerGraphQLErrorActionListener` seam stays owned by app-scope
 *   surfaces, so a page-level form must NOT register over it), and yields
 *   `{ field, message }` pairs ready for RHF.
 *
 * CONTRACT POSTURE
 *  - REQ-015: each `extensions.fields[]` entry already carries a fully
 *    localized user-facing `message` — that is the ONLY string echoed into
 *    the result. Nothing else from the wire (`code`, unknown extras, raw
 *    top-level error text) ever lands on a field (whitelist posture mirrors
 *    `projectTextFieldErrors` in `frontend/components/ui/fieldError.ts`).
 *  - REQ-055: this module adds ZERO translation surface. Field messages come
 *    verbatim from the server-localized wire pairs; every fallback copy used
 *    by consumers comes from EXISTING `auth` namespace keys.
 *  - Rows without field pairs (CONFLICT notice, masked INTERNAL_SERVER_ERROR,
 *    row-less codes …) contribute nothing, leaving the form's pre-existing
 *    per-code fallback copy untouched.
 *  - Duplicated field paths resolve FIRST-WINS — one helper line per field.
 *  - Layer rule respected: NO import of `@/backend/types` — the wire shape is
 *    narrowed via `extractWireFieldErrors`' structural guard (depcruise
 *    `frontend-no-backend-deps`).
 *
 * This module is PURE: no React, no MUI, no Apollo runtime imports — safe to
 * unit-test at logic tier and to call from any submit handler.
 */

import { extractWireFieldErrors, mapGraphQLErrorByCode } from "@/frontend/providers/apollo/error-link.map";

/** ONE whitelisted, server-localized field-error pair ready for RHF. */
export interface ProjectedFieldError {
  /** RHF-consumable form path, e.g. `"email"`, `"homeWork.currentGrade"`. */
  readonly field: string;
  /** Fully localized user-facing message (REQ-015 wire contract). */
  readonly message: string;
}

/**
 * Contextual sink matching React Hook Form's `setError(name, error)` pair
 * shape. Generic over the form's accepted field-path union (narrowed by a
 * caller-supplied guard — never by an unsafe assertion) so callers keep full
 * `FieldPath<TFormValues>` checking at the call site.
 */
export type FieldErrorSink<TField> = (field: TField, error: { readonly message: string }) => void;

type UnknownRecord = Record<string, unknown>;

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

/**
 * Applies ONE wire error item when it carries a string `extensions.code`,
 * accumulating its mapped field pairs into `projected` (first-wins).
 */
function collectFromErrorItem(item: unknown, projected: ProjectedFieldError[]): void {
  if (!isUnknownRecord(item)) return;
  const extensions = item.extensions;
  if (!isUnknownRecord(extensions)) return;
  const rawCode = extensions.code;
  if (typeof rawCode !== "string") return;

  const action = mapGraphQLErrorByCode(rawCode, {
    contextKind: "mutation",
    hasForm: true,
    fields: extractWireFieldErrors(extensions.fields),
  });

  for (const pair of action?.fieldErrors ?? []) {
    if (!projected.some(existing => existing.field === pair.field)) {
      projected.push({ field: pair.field, message: pair.message });
    }
  }
}

/**
 * Walks an Apollo/Error cause chain collecting field pairs from every
 * recognized shape:
 *  - combined containers exposing an `errors[]` array (Apollo Client v4
 *    `CombinedGraphQLErrors`),
 *  - bare error items carrying their own `extensions` (single GraphQLError),
 *  - `cause` hops (`ApolloError.cause`, nested `Error.cause` chains).
 */
function walkErrorChain(current: unknown, seen: Set<unknown>, projected: ProjectedFieldError[]): void {
  let level: unknown = current;
  while (isUnknownRecord(level) && !seen.has(level)) {
    seen.add(level);
    const errors = level.errors;
    if (Array.isArray(errors)) {
      for (const item of errors) {
        collectFromErrorItem(item, projected);
      }
    } else if (level.extensions !== undefined) {
      collectFromErrorItem(level, projected);
    }
    level = level.cause;
  }
}

/**
 * Projects every `extensions.fields[]` pair carried by a failed GraphQL
 * mutation response into first-wins `[{ field, message }]` pairs in wire
 * order.
 *
 * Returns an EMPTY array when the failure carries no projectable fields
 * (transport errors, non-VALIDATION codes, VALIDATION without a well-formed
 * `fields[]`, malformed entries) so callers fall through to their existing
 * code-based fallback copy unchanged.
 *
 * @example
 * const pairs = projectMutationFieldErrors(err); // [{field:"email", …}]
 */
export function projectMutationFieldErrors(error: unknown): readonly ProjectedFieldError[] {
  const projected: ProjectedFieldError[] = [];
  walkErrorChain(error, new Set<unknown>(), projected);
  return projected;
}

/**
 * Feeds a projection into a typed field-error sink (RHF `setError`) in
 * deterministic order and reports how many pairs were applied.
 *
 * Pair fields are narrowed into `TField` exclusively through the caller's
 * `isAcceptedField` guard (`value is TField`) — fields outside the form's
 * known paths are skipped, never force-cast in (server-controlled input,
 * whitelist posture). Unknown-path skipping keeps spoofed/mismatched wire
 * payloads from leaking anywhere into rendered state.
 *
 * `applied > 0` means the response carried usable `extensions.fields[]`: per
 * the REQ-061 contract the per-field mapping REPLACES the global-form
 * fallback — callers should suppress their generic inline alert for these
 * failures. `applied === 0` leaves form state untouched (callers keep prior
 * behavior).
 */
export function applyProjectedFieldErrors<TField extends string>(
  projected: readonly ProjectedFieldError[],
  isAcceptedField: (field: string) => field is TField,
  sink: FieldErrorSink<TField>
): number {
  let applied = 0;
  for (const pair of projected) {
    if (!isAcceptedField(pair.field)) continue;
    sink(pair.field, { message: pair.message });
    applied += 1;
  }
  return applied;
}
