/**
 * Shared GraphQL error extraction utilities.
 *
 * Extracted from LoginForm.tsx + RegisterForm.tsx to eliminate code
 * duplication (jscpd clones). These helpers traverse the Apollo error +
 * cause chain looking for `extensions.code` (set by the DomainError
 * hierarchy on the backend) and the first GraphQL error message.
 */

/**
 * Extracts the `extensions.code` from an Apollo error (traverses the cause
 * chain). Returns `null` if no code is present.
 *
 * Used by forms to map server-side error codes to localized messages
 * (`UNAUTHORIZED` → `invalidCredentials`, `CONFLICT` → `emailAlreadyExists`, etc.).
 */
export function extractErrorCode(error: unknown): string | null {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const extCode = extractCodeFromExtensions(current);
    if (extCode) return extCode;
    const directCode = extractStringCode((current as { code?: unknown }).code);
    if (directCode) return directCode;
    const arrCode = extractCodeFromErrorsArray(current);
    if (arrCode) return arrCode;
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

/**
 * Extracts the first GraphQL error message from an Apollo error.
 * Used to surface the server-side localized validation message.
 */
export function extractErrorMessage(error: unknown): string | null {
  let current: unknown = error;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const msg = tryExtractMessage(current);
    if (msg) return msg;
    if (current instanceof Error && current.message) {
      return current.message;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return null;
}

function tryExtractMessage(obj: object): string | null {
  const errors = (obj as { errors?: unknown[] }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const firstErr = errors[0];
  if (!firstErr || typeof firstErr !== "object") return null;
  const message = (firstErr as { message?: unknown }).message;
  return typeof message === "string" ? message : null;
}

/** Returns `code` if it's a string, otherwise `null`. */
function extractStringCode(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Reads `extensions.code` from an error-shape object. */
function extractCodeFromExtensions(obj: object): string | null {
  const extensions = (obj as { extensions?: unknown }).extensions;
  if (!extensions || typeof extensions !== "object") return null;
  return extractStringCode((extensions as { code?: unknown }).code);
}

/** Reads `errors[0].extensions.code` from an Apollo CombinedGraphQLErrors shape. */
function extractCodeFromErrorsArray(obj: object): string | null {
  const errors = (obj as { errors?: unknown[] }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const firstErr = errors[0];
  if (!firstErr || typeof firstErr !== "object") return null;
  return extractCodeFromExtensions(firstErr);
}
