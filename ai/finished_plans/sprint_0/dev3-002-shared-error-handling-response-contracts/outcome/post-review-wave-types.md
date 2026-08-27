# Post-Review Wave Outcome — Types & Contracts (Task ID 10-a)

- **Date:** 2026-08-26
- **Wave:** Phase 6.1 Review Wave — Types & Contracts leg for plan dev3-002
- **Reviewer role:** REVIEWER + light-fixer (no wholesale rewrites)
- **Scope honored:** `backend/types/errors/api-error.types.ts`, `backend/types/errors/index.ts`, `backend/types/index.ts` (barrel hunk), `backend/lib/errors/error-code-taxonomy.ts`, `shared/locale/types/errors/index.ts`, `shared/locale/en/errors/index.ts`, `shared/locale/ar/errors/index.ts`
- **VERDICT: PASS-WITH-FIXES** — 0 CRITICAL · 0 HIGH · 1 MEDIUM-borderline-LOW doc finding FIXED in place · remaining findings report-only/pre-existing. All gates exit 0 after the fix.

Pre-reads applied: `outcome/1.1-outcome.md` (exported surface + carry-forwards), `outcome/2M-outcome.md` check rows (esp. #3a taxonomy sole-status-source), `plan.md` §2.2 prescribed shapes, `backend/types/AGENTS.md` (naming/barrel/location CRITICAL rules), `deferred-items.md` ledger BLT-01…BLT-14 (pre-existing filter for every finding below).

---

## Findings table

| # | Severity | File:line | Description | Pre-existing? | Action |
|---|---|---|---|---|---|
| F1 | **LOW** | `backend/types/index.ts:12–14` | Stale barrel header note: "`DBTransaction`/`DBQueryExecutor` … top-level db.types.ts — to be added by a downstream ticket; not yet present in DEV1-001" while `backend/types/db.types.ts` EXISTS (created in DEV1-002 era, commits `a874acb`/`96b9ffc`, 2026-08-25 — before this plan's Phase 0+1 commit `dea88a9`) and line 27 already re-exports it. Contradicts `backend/types/AGENTS.md`'s completed-migration record. Doc-comment drift only; zero type/runtime impact. Present-tense reading would mislead newcomers into expecting the file to be absent. | YES (DEV1-001-era sentence left behind when the downstream ticket landed the file; Task 1.1's "updated truthfully" pass covered the inventory sentence at :16–19, not this one) | **FIXED in place** — reworded to "(top-level db.types.ts, re-exported below; migrated from `@/backend/db/db.types`)". QL sub-loop `--lifecycle duplicates` exit 0 re-run on the file. |
| F2 | **LOW** | `shared/locale/{en,ar}/auth/index.ts:33,43` vs the errors triple | Cross-namespace key overlap errors↔auth: `rateLimitExceeded` carries IDENTICAL strings in both namespaces (en+ar); `accountBlocked` diverges (auth: "suspended or blocked… contact support"; errors: plain "blocked"). REQ-055 prohibits NEW near-duplicates — **none were introduced by this plan**: parent-of-`dea88a9` snapshot already held 17/18 errors keys incl. both overlaps; Task 1.2 added exactly one key (`duplicateRequest`, proven unique repo-wide by case-insensitive scan vs auth/common/dashboard/landing/recitation). Errors-side keys are canonical per BLT-01 closure + 1.2-outcome naming decisions (`errors.rateLimitExceeded` consumed at 4 sites incl. `app/api/graphql/route.ts:204` + `RetryableNotice`). Auth files are OUTSIDE this wave's scope. | YES | Report-only. Suggest Phase 7 knowledge propagation records the errors-vs-auth dedup decision (which side owns what) instead of silently deleting either side. |
| F3 | INFO | `shared/locale/*/errors/index.ts` (`accountBlocked`) | `errorsTranslations.accountBlocked` has NO consumer found repo-wide (production or tests; governance login denials read `AuthLabels.accountBlocked` instead). Dead-key candidate — but removal would shrink the locked 18-key FINAL KEY LIST contract surface (1.2 outcome) that `GraphQLErrorAction.messageKey: keyof ErrorsLabels` typing depends on for breadth. | YES | No action (contract-surface churn out of a review wave's mandate; flag for Phase 7 ownership). |
| F4 | INFO | `frontend/providers/apollo/error-link.map.ts:36–49` (`WireFieldError`), `frontend/components/ui/fieldError.ts:32–37` (`FieldErrorContractEntry`) | Frontend structural mirrors of canonical `ApiFieldErrorType`. NOT shadowing violations: distinct names (zero TS2308 exposure under root-barrel `export *`), documented as intentional due to `.dependency-cruiser.js` `frontend-no-backend-deps`, carry explicit "KEEP THE THREE FIELDS IN SYNC" notes, and are drift-pinned by the 4.2/4.3 pure suites. Single canonical declaration of every `{X}Type`/`{X}ReturnType` name verified repo-wide. | YES | No action. |

**CRITICAL/HIGH requiring report-only proposals: NONE** (nothing qualifies).

---

## Review checklist results

| # | Check | Method | Verdict |
|---|---|---|---|
| 1 | Canonical naming; no shadowing definitions repo-wide | `rg '(export )?(type\|interface)\s+(ErrorCode\|ApiFieldErrorType\|ApiErrorEnvelopeReturnType\|ApiSuccessEnvelopeReturnType\|GraphQLErrorExtensionsType)\b'` over backend/frontend/shared/app → exactly ONE declaration block (`api-error.types.ts:39–124`); `rg 'ErrorCode\s*='` → only the canonical union + test-local annotation + DISTINCT `ContractErrorCode` (contracts/, different symbol, no collision vs `./errors` sibling under root `export *`) | ✅ PASS |
| 2 | Import-path consistency (@/ aliases; no relative cross-layer) | Scope barrels use `./` + `export *` only (AGENTS.md rule); taxonomy imports `ErrorCode` from `@/backend/types`; locale triple imports `ErrorsLabels` from `@/shared/locale/types/errors`; `rg 'from "\.{1,2}/'` across all 7 scope files → ONLY the two legitimate same-directory barrel lines | ✅ PASS |
| 3 | Value-vs-type import correctness at EVERY use site | All consumers of the five contract names + `ErrorsLabels` use `import type` (`error-masking.ts:65`, `api-response.ts:55`, `errors.ts:13`, test files, locale namespace module); zero `import { … Type … }` non-type matches repo-wide. Runtime symbols (`ERROR_CODE_HTTP_STATUS`, `normalizeErrorCode`, `isErrorCode`, `isDomainError`, `maskInternalError`) are value-imported where used (`api-response.ts:45–53` w/ correct inline `type DomainError`). No `import type` where a runtime value is needed — `ErrorCode` is a deliberate type-only string union with no runtime twin. | ✅ PASS |
| 4 | `details: unknown` preserved end-to-end | Canonical declaration untouched (`details?: unknown`, `api-error.types.ts:86`); REST envelope built by explicit property assembly WITHOUT synthesizing details (`apiErrorResponse`, api-response.ts:197–208); GraphQL finalizer rebuilds extensions by explicit property mapping (error-masking.ts:672–685); `rg 'as \{[^}]*details\|details\?:'` outside the canonical file → EMPTY (no stray casts/narrowings on any wire path) | ✅ PASS |
| 5 | Decision D3 — no pgEnum/GraphQL enum leakage | Case-insensitive scan `pgEnum\|graphQLEnumType\|pothos.*enum\|registerEnum` over all touched dirs → only prose "NOT a pgEnum" doc-comments (excluded explicitly by wording); `git status`/diff shows ZERO `db/schema*` changes; `ErrorCode` remains compile-time-only union, `LEGACY_ERROR_CODE_ALIASES`/maps stay frozen data | ✅ PASS |
| 6 | i18n triple sync (mechanical) + near-dups | Bun runtime scan: types=18, en=18, ar=18; sets equal across all three AND declaration order identical types≡en≡ar; zero intra-file dupes. Near-dup sweep vs auth/common/dashboard/landing/recitation (exact + case-insensitive): zero NEW overlaps from this ticket (F2 rows pre-date it); `common.delete` substring heuristic dismissed (different semantics); `duplicateRequest` unique repo-wide | ✅ PASS |
| 7 | Readonly discipline | Every member of all four interfaces readonly INCLUDING nested `error` object and `readonly ApiFieldErrorType[]` arrays; taxonomy tables `Object.freeze`d AND `Readonly<Record<…>>`-typed; `CANONICAL_SELF_MAP` keeps the `satisfies Record<ErrorCode, ErrorCode>` exhaustiveness lock; mutation-friction claims from 1.1 TE remain structurally valid | ✅ PASS |
| ★ | (bonus re-check) Taxonomy sole-status-source — 2M gate row #3a against CURRENT tree | Status literals in production (`error-code-taxonomy.ts`, `error-masking.ts`, `api-response.ts`) = EXACTLY the 9 map rows `error-code-taxonomy.ts:42–50`; derivations flow through `normalizeErrorCode`→`ERROR_CODE_HTTP_STATUS` only (`statusForTransportCode` + masked fallback row) | ✅ PASS |

---

## Actions taken

1. **[FIX] F1** — `backend/types/index.ts:12–14` stale db.types.ts provenance note corrected (comment-only edit, no exported surface change).

## Quality gates (post-fix)

| Gate | Result |
|---|---|
| `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` × **7 scope files** (incl. edited file) | ✅ exit 0 ×7 (tsgo·oxlint·biome·lint:type-aware·check:duplicates each stage) |
| `bun tsgo` full project (tree includes concurrent 10-b/10-c edits) | ✅ exit 0 — 0 errors |
| D3 enum-leakage scan | ✅ empty |
| Scoped git delta attributable to THIS task | `backend/types/index.ts` only (other dirty files owned by concurrent wave agents: `RegisterForm.tsx`, `error-link.map.ts` = 10-c; `api-response.ts` = backend-wave) |

## Carry-forward notes for host/Phase 7

1. F2/F3: fold the errors↔auth namespace dedup story into the Phase 7 canonical contract doc (`docs/graphql/domain-error-extensions-code.md` §i18n or equivalent) rather than leaving tribal knowledge.
2. Root-barrel collision guard (1.1 carry-forward #3) still stands: future domain barrels must never introduce `ErrorCode`/`ApiFieldErrorType`/`ApiErrorEnvelopeReturnType`/`ApiSuccessEnvelopeReturnType`/`GraphQLErrorExtensionsType`.
3. No deferred-items.md rows added — all findings resolved as pre-existing report-only/no-action per ledger filter (BLT-01 already owns the naming decisions relevant to F2).

**Final verdict: PASS-WITH-FIXES** (types & contracts surface conformant; single LOW doc-drift fixed in place; zero blocking findings).
