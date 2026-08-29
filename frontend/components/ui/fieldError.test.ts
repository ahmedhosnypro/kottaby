/**
 * Colocated unit tests for `fieldError.ts` — pure-function tier ONLY.
 *
 * Render-tier component tests (PermissionDeniedFallback / RetryableNotice via
 * Happy DOM + Testing Library) are DEFERRED: the `test/ui/` scaffold this
 * repo's package.json scripts expect (happydom-preload.ts /
 * translation-preload.ts / next-dynamic-mock.ts / TestWrapper) does not exist
 * in-tree. No scaffold was faked to force this tier.
 *
 * Assertion discipline: these tests assert STRUCTURE, not user-facing copy —
 * no hardcoded UI strings are introduced here (messages are opaque pass-through
 * projections; the localized values themselves are owned by shared/locale).
 */
import { describe, expect, test } from "bun:test";
import {
  EMPTY_FIELD_ERROR_PROPS,
  isProjectableFieldEntry,
  projectTextFieldErrors,
  textFieldAriaInvalid,
  textFieldErrorProps,
} from "@/frontend/components/ui/fieldError";

const MESSAGE_A = "field-error-a";
const MESSAGE_B = "field-error-b";

describe("isProjectableFieldEntry", () => {
  test("accepts whitelisted { field, message } entries", () => {
    expect(isProjectableFieldEntry({ field: "email", code: "EMAIL_INVALID", message: MESSAGE_A })).toBeTrue();
  });

  test("rejects non-object, array, null, and malformed entries", () => {
    expect(isProjectableFieldEntry(undefined)).toBeFalse();
    expect(isProjectableFieldEntry(null)).toBeFalse();
    expect(isProjectableFieldEntry(["email"])).toBeFalse();
    expect(isProjectableFieldEntry("email")).toBeFalse();
    expect(isProjectableFieldEntry({ message: MESSAGE_A })).toBeFalse();
    expect(isProjectableFieldEntry({ field: "email" })).toBeFalse();
    expect(isProjectableFieldEntry({ field: "", message: MESSAGE_A })).toBeFalse();
    expect(isProjectableFieldEntry({ field: "email", message: "   " })).toBeFalse();
  });
});

describe("projectTextFieldErrors", () => {
  test("projects exactly { error, helperText } per valid entry (whitelist, code dropped)", () => {
    const projected = projectTextFieldErrors([{ field: "email", code: "EMAIL_INVALID", message: MESSAGE_A }]);
    expect(projected.email).toEqual({ error: true, helperText: MESSAGE_A });
    expect(Object.keys(projected.email)).toEqual(["error", "helperText"]);
  });

  test("skips malformed entries instead of echoing fragments", () => {
    const projected = projectTextFieldErrors([
      { field: "email", message: "" },
      { field: "", message: MESSAGE_A },
      null,
      "email",
      undefined,
    ]);
    expect(Object.keys(projected)).toEqual([]);
    expect(projected[""]).toBeUndefined();
  });

  test("keeps FIRST occurrence when a field is duplicated", () => {
    const projected = projectTextFieldErrors([
      { field: "email", message: MESSAGE_A },
      { field: "email", message: MESSAGE_B },
    ]);
    expect(projected.email?.helperText).toBe(MESSAGE_A);
  });

  test("maps distinct fields independently and tolerates undefined input", () => {
    const projected = projectTextFieldErrors([
      { field: "email", message: MESSAGE_A },
      { field: "homeWork.currentGrade", message: MESSAGE_B },
    ]);
    expect(projected.email).toEqual({ error: true, helperText: MESSAGE_A });
    expect(projected["homeWork.currentGrade"]).toEqual({ error: true, helperText: MESSAGE_B });
    expect(Object.keys(projectTextFieldErrors(undefined))).toEqual([]);
  });
});

describe("textFieldErrorProps", () => {
  test("returns error+helperText for a present field", () => {
    const props = textFieldErrorProps([{ field: "phone", message: MESSAGE_B }], "phone");
    expect(props.error).toBeTrue();
    expect(props.helperText).toBe(MESSAGE_B);
  });

  test("returns inert spread-safe props for absent/invalid lookups", () => {
    expect(textFieldErrorProps([{ field: "phone", message: MESSAGE_B }], "email")).toEqual(EMPTY_FIELD_ERROR_PROPS);
    expect(textFieldErrorProps(undefined, "email").helperText).toBeUndefined();
    // Inert projection must NOT enable MUI's error styling.
    expect(EMPTY_FIELD_ERROR_PROPS.error).toBeFalse();
  });
});

describe("textFieldAriaInvalid", () => {
  test("mirrors !!error for present and absent fields", () => {
    const fields = [{ field: "email", message: MESSAGE_A }];
    expect(textFieldAriaInvalid(fields, "email")).toBeTrue();
    expect(textFieldAriaInvalid(fields, "phone")).toBeFalse();
    expect(textFieldAriaInvalid(undefined, "email")).toBeFalse();
  });
});
