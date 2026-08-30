/**
 * `handshakeCode`-namespace locale-parity verification
 * · ar+en parity gate + format-copy security pin.
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `handshakeCode` leaf maps expose
 *      IDENTICAL key sets with non-empty string values (belt #2: the PRIMARY
 *      parity gate is compile-time typing where BOTH leaf consts are typed
 *      `HandshakeCodeLabels`; any missing key fails `bun tsgo`. This suite
 *      keeps the guarantee enforced even if someone loosens that typing
 *      later).
 *   2. NEW TRANSPORT KEYS — the two `errors`-namespace additions for the
 *      handshake-code surfaces (`handshakeCodeInvalid`,
 *      `studentHandshakeNotFound`) resolve as non-empty localized strings in
 *      BOTH locales (the sibling dynamic errors gate covers them through
 *      ar/en key-set equality; they are asserted here directly for local
 *      fail-fast clarity).
 *   3. FORMAT-COPY SECURITY PIN — ZERO locale value in either namespace
 *      contains a literal WORKING code (canonical `HANDSHAKE_CODE_PATTERN`
 *      via the `isHandshakeCode` guard): the copy may teach the FORMAT
 *      (`KSB-` prefix + the masked non-hexadecimal `XXXXXXXX` placeholder)
 *      but must never enumerate a real code. The format-teaching helper is
 *      positively controlled: both invalid-format strings (UI + errors)
 *      carry the canonical prefix in both locales.
 *   4. PLACEHOLDER-NAME PARITY — ICU placeholder-name sets are IDENTICAL
 *      across ar/en per key (currently zero placeholders; future keys with
 *      interpolation inherit the pin).
 *   5. REGISTRY WIRING — the `HandshakeCode` handle is registered in
 *      `shared/locale/namespaces/index.ts` with the conventional
 *      `<ns>.<ns>` id and its getter resolves to the composed bundle slice.
 *
 * Mirrors the structure of `shared/locale/applicant-namespace.parity.test.ts`
 * (the sibling applicant-namespace gate whose pattern this namespace follows).
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/handshakeCode-namespace.parity.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { HANDSHAKE_CODE_PREFIX, isHandshakeCode, normalizeHandshakeCode } from "@/shared/constants";
import { errorsAr } from "@/shared/locale/ar/errors";
import { handshakeCodeAr } from "@/shared/locale/ar/handshakeCode";
import { arMessages } from "@/shared/locale/ar/messages";
import { errorsEn } from "@/shared/locale/en/errors";
import { handshakeCodeEn } from "@/shared/locale/en/handshakeCode";
import { enMessages } from "@/shared/locale/en/messages";
import { HandshakeCode } from "@/shared/locale/namespaces/handshakeCode";
import { namespaces } from "@/shared/locale/namespaces/index";

// ─── New transport keys on the existing errors namespace ─────────────────────

const HANDSHAKE_ERROR_KEYS = ["handshakeCodeInvalid", "studentHandshakeNotFound"] as const;

/** Every `{name}` ICU placeholder occurring in a template, deduplicated + sorted. */
function icuPlaceholdersOf(template: string): string[] {
  const seen = new Set<string>();
  const placeholder = /\{([A-Za-z]\w*)\}/g;
  let match = placeholder.exec(template);
  while (match !== null) {
    if (typeof match[1] === "string") {
      seen.add(match[1]);
    }
    match = placeholder.exec(template);
  }
  return [...seen].toSorted((a, b) => a.localeCompare(b));
}

/** Reads one non-empty-string value slot off a locale map — throws otherwise. */
function nonEmptyLabelOf(localeMap: object, key: string, localeName: string): string {
  const value: unknown = Reflect.get(localeMap, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`handshakeCode.${localeName}.${key} must be a non-empty localized string`);
  }
  return value;
}

/**
 * Working-code literals smuggled into copy — candidates are the alphanumeric
 * tokens of the value, normalized (trim + uppercase) and then checked against
 * the CANONICAL guard. The masked `KSB-XXXXXXXX` placeholder can never match
 * (`X` is not a hexadecimal digit).
 */
function literalCodeTokensOf(value: string): string[] {
  return value.split(/[^A-Za-z0-9-]+/).filter(token => isHandshakeCode(normalizeHandshakeCode(token)));
}

// ===========================================================================
describe("compile-time parity mirror — ar/en handshakeCode key sets agree", () => {
  test("identical sorted key sets across BOTH locale sources", () => {
    const arKeys = Object.keys(handshakeCodeAr).toSorted((a, b) => a.localeCompare(b));
    const enKeys = Object.keys(handshakeCodeEn).toSorted((a, b) => a.localeCompare(b));

    expect(arKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(arKeys);
  });

  test("every value on BOTH maps is a non-empty localized string (zero dead keys)", () => {
    for (const key of Object.keys(handshakeCodeAr)) {
      expect(nonEmptyLabelOf(handshakeCodeAr, key, "ar").length).toBeGreaterThan(0);
      expect(nonEmptyLabelOf(handshakeCodeEn, key, "en").length).toBeGreaterThan(0);
    }
    // Symmetric sweep — guards an en-only key that ar lost via future drift.
    for (const key of Object.keys(handshakeCodeEn)) {
      expect(nonEmptyLabelOf(handshakeCodeAr, key, "ar").length).toBeGreaterThan(0);
    }
  });

  test.each([...HANDSHAKE_ERROR_KEYS])("new errors key `%s` resolves as a non-empty string in BOTH locales", key => {
    expect(nonEmptyLabelOf(errorsAr, key, "ar").length).toBeGreaterThan(0);
    expect(nonEmptyLabelOf(errorsEn, key, "en").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
describe("format-copy security pin — format taught, working codes NEVER enumerated", () => {
  test("ZERO locale value in either namespace contains a literal working code (canonical guard)", () => {
    for (const [localeMap, localeName] of [
      [errorsAr, "errors.ar"],
      [errorsEn, "errors.en"],
      [handshakeCodeAr, "handshakeCode.ar"],
      [handshakeCodeEn, "handshakeCode.en"],
    ] as const) {
      for (const key of Object.keys(localeMap)) {
        const value = nonEmptyLabelOf(localeMap, key, localeName);
        expect(literalCodeTokensOf(value)).toEqual([]);
      }
    }
  });

  test("both invalid-format helpers carry the canonical prefix in BOTH locales (format is taught)", () => {
    expect(handshakeCodeEn.invalidFormat.includes(HANDSHAKE_CODE_PREFIX)).toBe(true);
    expect(handshakeCodeAr.invalidFormat.includes(HANDSHAKE_CODE_PREFIX)).toBe(true);
    expect(errorsEn.handshakeCodeInvalid.includes(HANDSHAKE_CODE_PREFIX)).toBe(true);
    expect(errorsAr.handshakeCodeInvalid.includes(HANDSHAKE_CODE_PREFIX)).toBe(true);
  });
});

// ===========================================================================
describe("placeholder-name sets are IDENTICAL across ar/en per key (no locale-local drift)", () => {
  test("handshakeCode + errors maps: per-key placeholder-name sets agree ar/en", () => {
    for (const [localeMapAr, localeMapEn] of [
      [handshakeCodeAr, handshakeCodeEn],
      [errorsAr, errorsEn],
    ] as const) {
      for (const key of Object.keys(localeMapAr)) {
        const value = nonEmptyLabelOf(localeMapAr, key, "ar");
        const arNames = icuPlaceholdersOf(value);
        const enNames = icuPlaceholdersOf(nonEmptyLabelOf(localeMapEn, key, "en"));
        expect(enNames).toEqual(arNames);
      }
    }
  });
});

// ===========================================================================
describe("registry + bundle wiring", () => {
  test("namespaces registry exposes the HandshakeCode handle with the `<ns>.<ns>` id convention", () => {
    expect(Object.hasOwn(namespaces, "HandshakeCode")).toBe(true);
    expect(HandshakeCode.id).toBe("handshakeCode.handshakeCode");
  });

  test("handle getter resolves the composed bundle slice (both locales)", () => {
    expect(HandshakeCode.getLabels(enMessages)).toBe(enMessages.handshakeCodeTranslations);
    expect(HandshakeCode.getLabels(arMessages)).toBe(arMessages.handshakeCodeTranslations);
  });

  test("`handshakeCodeTranslations` exists on BOTH message bundles", () => {
    expect(Object.hasOwn(enMessages, "handshakeCodeTranslations")).toBe(true);
    expect(Object.hasOwn(arMessages, "handshakeCodeTranslations")).toBe(true);
  });
});
