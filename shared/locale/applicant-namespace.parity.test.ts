/**
 * `applicant`-namespace locale-parity verification
 * · ar+en parity gate + cooldown-placeholder security pin.
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `applicant` leaf maps expose IDENTICAL
 *      key sets with non-empty string values (belt #2: the PRIMARY parity gate
 *      is compile-time typing where BOTH leaf consts are typed
 *      `ApplicantLabels`; any missing key fails `bun tsgo`. This suite keeps
 *      the guarantee enforced even if someone loosens that typing later).
 *   2. COOLDOWN PLACEHOLDER PIN — the two cooldown surfaces (errors'
 *      `applicantCooldownActive` + applicant's `cooldownExpiryLine`) carry
 *      EXACTLY ONE ICU placeholder, named `cooldownUntil`, in BOTH locales —
 *      the timestamp is the ONLY interpolated value (no other user
 *      data enters the reject copy) and its NAME must stay identical ar/en so
 *      consumers can expand it uniformly.
 *   3. REGISTRY WIRING — the `Applicant` handle is registered in
 *      `shared/locale/namespaces/index.ts` with the conventional
 *      `<ns>.<ns>` id and its getter resolves to the composed bundle slice.
 *
 * Mirrors the structure of `shared/locale/errors-namespace.parity.test.ts`
 * (the sibling dynamic errors gate, which independently covers the three new
 * `errors` keys through ar/en key-set equality; the NEW errors keys are also
 * asserted here directly for local fail-fast clarity).
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/applicant-namespace.parity.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { applicantAr } from "@/shared/locale/ar/applicant";
import { errorsAr } from "@/shared/locale/ar/errors";
import { arMessages } from "@/shared/locale/ar/messages";
import { applicantEn } from "@/shared/locale/en/applicant";
import { errorsEn } from "@/shared/locale/en/errors";
import { enMessages } from "@/shared/locale/en/messages";
import { Applicant } from "@/shared/locale/namespaces/applicant";
import { namespaces } from "@/shared/locale/namespaces/index";

// ─── New transport keys on the existing errors namespace ─────────────────────

const APPLICANT_ERROR_KEYS = ["applicantNotFound", "applicantCooldownActive", "applicantStatusCorrupt"] as const;

const COOLDOWN_PLACEHOLDER = "cooldownUntil";

/** Number of times the literal `{name}` placeholder occurs in a template (no dedup). */
function icuPlaceholderOccurrenceCount(template: string, name: string): number {
  return template.split(`{${name}}`).length - 1;
}

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
    throw new Error(`applicant.${localeName}.${key} must be a non-empty localized string`);
  }
  return value;
}

// ===========================================================================
describe("compile-time parity mirror — ar/en applicant key sets agree", () => {
  test("identical sorted key sets across BOTH locale sources", () => {
    const arKeys = Object.keys(applicantAr).toSorted((a, b) => a.localeCompare(b));
    const enKeys = Object.keys(applicantEn).toSorted((a, b) => a.localeCompare(b));

    expect(arKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(arKeys);
  });

  test("every value on BOTH maps is a non-empty localized string (zero dead keys)", () => {
    for (const key of Object.keys(applicantAr)) {
      expect(nonEmptyLabelOf(applicantAr, key, "ar").length).toBeGreaterThan(0);
      expect(nonEmptyLabelOf(applicantEn, key, "en").length).toBeGreaterThan(0);
    }
    // Symmetric sweep — guards an en-only key that ar lost via future drift.
    for (const key of Object.keys(applicantEn)) {
      expect(nonEmptyLabelOf(applicantAr, key, "ar").length).toBeGreaterThan(0);
    }
  });

  test.each([...APPLICANT_ERROR_KEYS])("new errors key `%s` resolves as a non-empty string in BOTH locales", key => {
    expect(nonEmptyLabelOf(errorsAr, key, "ar").length).toBeGreaterThan(0);
    expect(nonEmptyLabelOf(errorsEn, key, "en").length).toBeGreaterThan(0);
  });
});

// ===========================================================================
describe("cooldown placeholder pin — {cooldownUntil} only, identical name in BOTH locales", () => {
  test("errors.applicantCooldownActive carries exactly one placeholder named cooldownUntil in BOTH locales", () => {
    const arTemplate = nonEmptyLabelOf(errorsAr, "applicantCooldownActive", "ar");
    const enTemplate = nonEmptyLabelOf(errorsEn, "applicantCooldownActive", "en");
    expect(icuPlaceholdersOf(arTemplate)).toEqual([COOLDOWN_PLACEHOLDER]);
    expect(icuPlaceholdersOf(enTemplate)).toEqual([COOLDOWN_PLACEHOLDER]);
    expect(icuPlaceholderOccurrenceCount(arTemplate, COOLDOWN_PLACEHOLDER)).toBe(1);
    expect(icuPlaceholderOccurrenceCount(enTemplate, COOLDOWN_PLACEHOLDER)).toBe(1);
  });

  test("applicant.cooldownExpiryLine carries exactly one placeholder named cooldownUntil in BOTH locales", () => {
    const arTemplate = nonEmptyLabelOf(applicantAr, "cooldownExpiryLine", "ar");
    const enTemplate = nonEmptyLabelOf(applicantEn, "cooldownExpiryLine", "en");
    expect(icuPlaceholdersOf(arTemplate)).toEqual([COOLDOWN_PLACEHOLDER]);
    expect(icuPlaceholdersOf(enTemplate)).toEqual([COOLDOWN_PLACEHOLDER]);
    expect(icuPlaceholderOccurrenceCount(arTemplate, COOLDOWN_PLACEHOLDER)).toBe(1);
    expect(icuPlaceholderOccurrenceCount(enTemplate, COOLDOWN_PLACEHOLDER)).toBe(1);
  });

  test("placeholder-name sets are IDENTICAL across ar/en per locale pair (no locale-local drift)", () => {
    for (const [localeMapAr, localeMapEn] of [
      [errorsAr, errorsEn],
      [applicantAr, applicantEn],
    ] as const) {
      for (const key of Object.keys(localeMapAr)) {
        // Grouped sub-blocks (object-valued slots) are skipped here — their
        // nested leaves never carry ICU placeholders in this pair, so they
        // cannot drift on placeholder NAMES; leaf-key parity itself is
        // enforced by the compile-time `ErrorsLabels`/`ApplicantLabels`
        // typing (tsgo belt #1) and the top-level key-set assertion above.
        const candidate = Reflect.get(localeMapAr, key);
        if (typeof candidate !== "string") {
          continue;
        }
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
  test("namespaces registry exposes the Applicant handle with the `<ns>.<ns>` id convention", () => {
    expect(Object.hasOwn(namespaces, "Applicant")).toBe(true);
    expect(Applicant.id).toBe("applicant.applicant");
  });

  test("handle getter resolves the composed bundle slice (both locales)", () => {
    expect(Applicant.getLabels(enMessages)).toBe(enMessages.applicantTranslations);
    expect(Applicant.getLabels(arMessages)).toBe(arMessages.applicantTranslations);
  });

  test("`applicantTranslations` exists on BOTH message bundles", () => {
    expect(Object.hasOwn(enMessages, "applicantTranslations")).toBe(true);
    expect(Object.hasOwn(arMessages, "applicantTranslations")).toBe(true);
  });
});
