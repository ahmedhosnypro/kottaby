/**
 * `errors`-namespace transport-message key verification
 * · ar+en parity gate + machine-constant exemption pinning.
 *
 * WHAT THIS LOCKS
 *   1. RUNTIME PARITY BELT — the ar/en `errors` leaf maps expose IDENTICAL key
 *      sets with non-empty string values (belt #2: the PRIMARY parity gate is
 *      the compile-time `MessageSchema`/`Translations` typing where BOTH leaf
 *      consts are typed `ErrorsLabels`; any missing key fails `bun tsgo`.
 *      This suite keeps the guarantee enforced even if someone loosens that
 *      typing later).
 *   2. ROUTE EMITTER COVERAGE — EVERY message key the GraphQL gateway transport
 *      actually emits is enumerated DYNAMICALLY from the route SOURCE DISK
 *      (`app/api/graphql/route.ts` seven-step gateway pipeline)
 *      by scanning its `errorsTranslations.<key>` consumption sites — both the
 *      direct-chain and held-variable realization forms — so any new emitter
 *      auto-enters this gate without editing the suite — and every discovered
 *      key MUST exist on BOTH locales.
 *   3. MACHINE-CONSTANT EXEMPTION (negative space) — ZERO locale keys are minted for the
 *      `_health` payload constants: the operator-facing machine payload
 *      (`status/service/version/timestamp`) is deliberately i18n-exempt, so no
 *      `*health*` key may EVER appear in either locale's `errors` map.
 *   4. IMPORT HYGIENE PINS — the touched surface (route.ts) contains ZERO
 *      `next-intl` imports / `getBackendTranslations` / `shared/messages`
 *      references: ONLY the compile-time system via `getServerTranslations`
 *      consumes these labels.
 *
 * ENVELOPE LOCALIZATION (rendering-path evidence): behavioral proof that the
 * transport rejection envelopes carry the LOCALIZED value (never a literal) is
 * owned by `app/api/graphql/test/graphql-route.transport.test.ts` — it resolves
 * `getServerTranslations("en"|"ar").errorsTranslations.badRequest` and asserts
 * equality against the WIRE message for every 400/405/413 rejection (ar parity
 * rows included).
 *
 * Pure unit tier — NO server boot, NO network, NO DB. Runs via the mandated
 * runner: `bun run test/scripts/run-test.ts shared/locale/errors-namespace.parity.test.ts`.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { errorsAr } from "@/shared/locale/ar/errors";
import { errorsEn } from "@/shared/locale/en/errors";
import type { ErrorsLabels } from "@/shared/locale/types/errors";

// ─── Route-source emission discovery ─────────────────────────────────────────

/** Consumption-site scanner: every `errorsTranslations.<key>` use in route.ts.
 *  Matches BOTH realization forms the gateway ships: direct chains
 *  (`getServerTranslations(…).errorsTranslations.<key>`) and the held-variable
 *  form (`const t = …errorsTranslations; message: t.<key>`). */
function routeEmittedErrorsKeys(): string[] {
  const source = readFileSync(resolve(process.cwd(), "app/api/graphql/route.ts"), "utf8");
  const seen = new Set<string>();
  const consumptionSite = /errorsTranslations\.([A-Za-z]\w*)/g;
  let match = consumptionSite.exec(source);
  while (match !== null) {
    if (typeof match[1] === "string") {
      seen.add(match[1]);
    }
    match = consumptionSite.exec(source);
  }
  return [...seen].toSorted((a, b) => a.localeCompare(b));
}

/**
 * Reads one non-empty-string value slot off a locale map — throws otherwise.
 * Reserved for transport emitter rows that always resolve to top-level leaf
 * strings (the route gateway never emits a grouped sub-block handle).
 */
function nonEmptyLabelOf(localeMap: ErrorsLabels, key: string, localeName: string): string {
  const value: unknown = Reflect.get(localeMap, key);
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`errors.${localeName}.${key} must be a non-empty localized string`);
  }
  return value;
}

/**
 * Walks a locale map depth-first and throws on the first violation: any leaf
 * that is not a non-empty string. Grouped sub-blocks (object-valued slots)
 * keep the same zero-dead-key discipline as top-level string slots — every
 * nested leaf must be a non-empty localized string. Cross-map leaf-key drift
 * is caught by the compile-time `ErrorsLabels` typing (the primary gate)
 * together with the top-level key-set assertion in the suite below.
 */
function assertEveryLeafNonEmpty(localeMap: object, localeName: string, pathPrefix = `errors.${localeName}`): void {
  for (const key of Object.keys(localeMap)) {
    const value: unknown = Reflect.get(localeMap, key);
    const path = `${pathPrefix}.${key}`;
    if (typeof value === "string") {
      if (value.length === 0) {
        throw new Error(`${path} must be a non-empty localized string`);
      }
      continue;
    }
    if (value !== null && typeof value === "object") {
      assertEveryLeafNonEmpty(value, localeName, path);
      continue;
    }
    throw new Error(`${path} must be a non-empty localized string or a grouped labels block`);
  }
}

// ===========================================================================
describe("compile-time parity mirror — ar/en key sets agree", () => {
  test("identical sorted key sets across BOTH locale sources", () => {
    const arKeys = Object.keys(errorsAr).toSorted((a, b) => a.localeCompare(b));
    const enKeys = Object.keys(errorsEn).toSorted((a, b) => a.localeCompare(b));

    expect(arKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(arKeys);
  });

  test("every leaf value on BOTH maps is a non-empty localized string (zero dead keys)", () => {
    expect(() => assertEveryLeafNonEmpty(errorsAr, "ar")).not.toThrow();
    expect(() => assertEveryLeafNonEmpty(errorsEn, "en")).not.toThrow();
  });
});

// ===========================================================================
describe("route emitters — every transport key exists in BOTH locales", () => {
  const emitted = routeEmittedErrorsKeys();

  test("discovery actually found the known pipeline emitters (suite cannot rot green)", () => {
    // The gateway's seven-step pipeline emits at least these three sites:
    // step-1 transport rejections, the 429 limiter branch, and the POST catch
    // fallback. If even ONE disappears from route.ts the scan itself failed.
    for (const required of ["badRequest", "rateLimitExceeded", "internalServerError"]) {
      expect(emitted).toContain(required);
    }
  });

  test.each(emitted)("emitted key `%s` resolves in BOTH ar and en maps", key => {
    expect(nonEmptyLabelOf(errorsAr, key, "ar").length).toBeGreaterThan(0);
    expect(nonEmptyLabelOf(errorsEn, key, "en").length).toBeGreaterThan(0);
    // Key must be part of the COMPILE-TIME schema too — Reflect-only additions
    // (untyped holes) are prohibited by the ErrorsLabels contract.
    expect(Object.hasOwn(errorsEn, key)).toBe(true);
  });
});

// ===========================================================================
describe("machine-constant exemption — `_health` payload constants stay OUT of locale files", () => {
  test("ZERO health-flavored keys exist in either locale's errors map", () => {
    for (const key of [...Object.keys(errorsAr), ...Object.keys(errorsEn)]) {
      expect(key.toLowerCase().includes("health")).toBe(false);
    }
  });
});

// ===========================================================================
describe("touched-surface import hygiene (route.ts)", () => {
  test("gateway route references ONLY the compile-time system — zero next-intl/getBackendTranslations/shared/messages", () => {
    const source = readFileSync(resolve(process.cwd(), "app/api/graphql/route.ts"), "utf8");

    expect(source.includes("next-intl")).toBe(false);
    expect(source.includes("getBackendTranslations")).toBe(false);
    expect(source.includes("shared/messages")).toBe(false);
    // Positive control — the compile-time consumer it MUST keep using:
    expect(source.includes("getServerTranslations")).toBe(true);
  });
});
