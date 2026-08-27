# Implementation Tasks: DEV3-003 — API Gateway & Routing Skeleton

> **Plan of record:** `ai/plans/dev3-003-api-gateway-routing-skeleton/`
> **Specs:** `specs.md` REQ-001..REQ-083 | **Plan:** `plan.md` D1–D10
> **Sprint 0 · Dev 3 (Shared) · 3 SP · Blocked by DEV3-002**

---

## Non-Negotiable Execution Protocol (MANDATORY for every task)

1. **Pre-Execution Outcome Knowledge Read:** Before starting ANY task, read ALL existing files under `ai/plans/dev3-003-api-gateway-routing-skeleton/outcome/`. Carry-forward knowledge takes precedence over assumptions.
2. **Post-Edit Verification:** Every created/modified file MUST pass:
   `bun run scripts/health/sub-loop.ts <file> --lifecycle duplicates` (exit code 0). Iterate until clean.
3. **Test Execution:** Tests run ONLY via `bun run test/scripts/run-test.ts <test-path>` (never raw `bun test`). Every test file must pass before its parent task is checked.
4. **Semantic Review Self-Check:** Before marking any task `[x]`, self-review against the semantic checklist: atomicity, env-config registration, zero dead code, no cross-layer imports (`shared/` purity, frontend↔backend isolation), enums as value imports (never `import type` in runtime positions), no `console.*`, no hardcoded colors/strings, no `await import(` in GraphQL modules, `headers.append` only for `Set-Cookie`.
5. **Outcome Documentation:** After EVERY task, write `ai/plans/dev3-003-api-gateway-routing-skeleton/outcome/<task-id>-outcome.md` containing: summary, files changed/NOT changed + why, verification results (commands + exit codes), cross-file dependencies discovered, carry-forward knowledge for downstream tasks.
6. **Checkbox Tracking:** Update `[ ]` → `[x]` immediately after the task's outcome file is written and verified. Never batch-check.
7. **Deferred-Items Discipline:** Any discovered defect in substrate (DEV2-001/002, DEV3-002) is NOT patched inline. Record `❌` (blocking) or `⚠️` (non-blocking, requires owner ticket) in `deferred-items.md` and route the fix via the owning stream.
8. **Applies Invariants:** Zero DB/schema drift (`bun validate:dbml` green, empty `git diff` on `backend/db/**`); closed public-operation allowlist; 401/403 exclusivity preserved; transport failures use real HTTP statuses; GraphQL domain errors ride HTTP 200 per Apollo convention.

> **UI-Task Pipeline Note:** This ticket ships **zero user-facing UI** (plan §5 — "no user-facing UI. No page routes are added, removed, or modified"). Consequently, NO task in this plan instantiates the frontend 7-stage pipeline (`.BF` Agent-Browser Functional Self-Loop / `.BS` Visual & Styling Screenshot Self-Loop), because there is no page, component, form, navigation, or rendered surface to exercise. The single frontend touch (Task 4.1 — Apollo cache policy) is non-visual and is verified via its unit/component test tier plus the REQ-075 coverage gate. This N/A determination is recorded in the Phase 0 baseline outcome and re-confirmed at the Phase 6 review-frontend wave.

---

## Phase 0: Pre-Implementation Baseline

- [x] 0.1 Record Error Baseline & Initialize Deferred-Items Ledger
  - Execute and capture output to `ai/plans/dev3-003-api-gateway-routing-skeleton/baseline/`:
    - `bun tsgo` → `baseline/tsgo.txt` + error count literal
    - `bun biome:check` → `baseline/biome.txt` + finding count literal
    - `bun run scripts/lint-service.ts --json --id baseline` → `baseline/lint.json`
    - `git diff --name-only` → `baseline/preexisting-modified-files.txt` (frozen pre-existing modified-file set; post-implementation comparisons exclude exactly this set)
    - `cd db && bunx @softwaretechnik/dbml-renderer --version` sanity + `bun validate:dbml` → `baseline/dbml.txt` (must be green pre-change per REQ-044)
  - Initialize `ai/plans/dev3-003-api-gateway-routing-skeleton/deferred-items.md` from `docs/spec-process-guide/templates/deferred-items-template.md`.
  - Pre-seed deferred ledger rows (non-blocking; each MUST carry an explicit owner ticket and ✅/targeted status per REQ-083):
    1. ⚠️→✅-targeted: Gateway HTTP-layer per-IP throttling (REQ-035) — owner: production-hardening/Sprint-4 ticket.
    2. ⚠️→✅-targeted: DB-backed readiness probe (REQ-012 tail) — owner: future readiness-probe ticket.
    3. ⚠️→✅-targeted: Optional `healthCheckQueryDocument` frontend document (REQ-062 tail) — owner: first consumer (DEV3-001 CI smoke or observability tooling).
    4. ⚠️→✅-targeted: `/api/logs` envelope adoption — owner: observability ticket (REQ-019).
    5. ⚠️→✅-targeted: `/api/cron/ticker`, `/api/cron/execute` envelope adoption — owner: cron-service ticket (REQ-019).
    6. ⚠️→✅-targeted: `/api/set-locale` envelope adoption — owner: i18n ticket (REQ-019).
    7. ⚠️→✅-targeted: GraphQL query depth/complexity limiting — owner: Sprint-4 hardening ticket (plan §6.5).
  - Record in the outcome: the REQ-002 health-payload i18n exemption (operator-facing machine constants) and the Phase-4 `.BF`/`.BS` N/A determination (no UI in plan §5).
  - _Requirements: REQ-001, REQ-002, REQ-035, REQ-062, REQ-082, REQ-083_
  - [x] 0.1.SR **Semantic Review**: Baseline counts are machine-produced literals (not paraphrased); ledger rows follow the template exactly; no ledger row is ❌ for pre-seeded items.
  - [x] 0.1.OC **Outcome**: Write `outcome/phase0-baseline-outcome.md` and `outcome/0.1-outcome.md`; check boxes.

- [x] 0.2 Prerequisite Substrate Verification (REQ-004 Dependency Guard)
  - Verify existence AND shape of consumed artifacts (evidence = file path + symbol name + grep output captured in outcome):
    - DEV3-002: `finalizeGraphqlErrors`, `resolveRequestId`, `apiSuccessResponse`, `apiErrorResponse`, error-code taxonomy module, `MAX_GRAPHQL_BODY_BYTES` (if already defined by DEV3-002) vs. needing definition here.
    - DEV2-001: `gqlContextFactory`, `ctx.authCookieOut` accumulator, `docs/auth/jwt-authentication-service.md` cookie matrix (`session_id` 7d / `refresh_token` 7d / `access_token` 15m, `httpOnly`, `sameSite: strict`, `secure` in prod).
    - DEV2-002: `buildAuthScopes`, scopeAuth/authScopes chain, 401-vs-403 semantics, existing D3 schema-coverage test location.
    - DEV1-002: `RegisterPublicRole` schema-layer gate (admin excluded) on `registerUser`.
    - DEV2-001 env posture: `IS_DEMO` flag gate present inside the `demoLogin` resolver (plan §3.3 — if absent/broken → ❌ ledger row + owning-stream fix, NOT local workaround).
    - Env-config registry: determine whether `APP_VERSION` must be registered in `env-config-keys.ts` (env-config semantic rule).
  - Verify codebase start-points exist per plan §4.1: `app/api/graphql/route.ts`, `backend/graphql/gqlContextFactory.ts`, `frontend/providers/apollo/apolloCache.ts`, `backend/graphql/query/index.ts`, `backend/graphql/pothos/shared/enum.pothos.ts`, `frontend/graphql/test/` harness (`setupTestServerLifecycle`, `testClient`).
  - Enumerate the actual `app/api/**/route.ts` file set on disk; append any route not in plan §3.5 to the ledger audit list (drives Task 2.2 route inventory).
  - Applicable AGENTS.md: root `AGENTS.md`, `backend/AGENTS.md`, `app/AGENTS.md`, `backend/graphql/AGENTS.md`.
  - _Requirements: REQ-004, REQ-019, REQ-035_
  - [x] 0.2.SR **Semantic Review**: Every missing/mis-shaped artifact produces a ❌ ledger row with owner and blocks dependent tasks; zero substrate edits made in this task.
  - [x] 0.2.OC **Outcome**: Write `outcome/0.2-prerequisite-verification-outcome.md`; check boxes. If any ❌ exists for a HARD blocker in the implementation path, STOP and escalate per protocol §7.

- [x] 0.3 Plan-Review Gate (Phase 1.5)
  - Execute the `@plan-review` quality gate against `specs.md` + `plan.md`: confirm all REQ IDs trace to at least one task below; confirm plan decisions D1–D10 have task-level expressions; confirm Phase 0→7 structure matches this document.
  - Write `ai/plans/dev3-003-api-gateway-routing-skeleton/outcome/plan-review-R1.md` (REQ-082 mandates it exists BEFORE implementation begins).
  - _Requirements: REQ-082_
  - [x] 0.3.OC **Outcome**: Gate outcome written; implementation tasks (Phase 1+) MUST NOT start until this box is checked.

---

## Phase 1: Types & Zero-Drift Schema Verification

- [x] 1.1 Create Canonical Gateway Types (`backend/types/gateway/`)
  - Create:
    - `backend/types/gateway/health-check.types.ts` — `HealthCheckReturnType { readonly status: "ok"; readonly service: "kottaby"; readonly version: string; readonly timestamp: string }` (plan §2.2; interface is acceptable for transport-contract types per DEV3-002 `backend/types/errors/` precedent; no `Schema` suffix — not a DB table).
    - `backend/types/gateway/gateway-context.types.ts` — `GatewayRequestMetadata { readonly requestId: string; readonly idempotencyKey: string | null }` (documentary contract over context, no runtime construction), `TransportErrorKind` string union (`"METHOD_NOT_ALLOWED" | "UNSUPPORTED_CONTENT_TYPE" | "PAYLOAD_TOO_LARGE" | "MALFORMED_JSON"`), `TransportGuardResult` discriminated union (`{ ok: true; body: unknown } | { ok: false; kind: TransportErrorKind }`).
    - `backend/types/gateway/index.ts` — barrel with `./`-relative `export *` lines only.
  - Modify: `backend/types/index.ts` — add `export * from "./gateway";` (one `/` per path, `./` relative).
  - Constraints: `.types.ts` files contain ZERO runtime exports (verified by static assertion A5 in Task 2.3); `TransportErrorKind` is a TS union — NEVER a DB/Pothos enum (plan §2.3, D3 precedent).
  - Applicable AGENTS.md: `backend/types/AGENTS.md`, `backend/types/gateway/` (none exists — note in outcome).
  - _Requirements: REQ-003_
  - [x] 1.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/types/gateway/health-check.types.ts --lifecycle duplicates` AND same for `gateway-context.types.ts` and both `index.ts` files (exit code 0, iterate until clean).
  - [x] 1.1.TE **Test Engineering**: Tier 1 — static assertion (registered in Task 2.3's suite, A5) that `backend/types/gateway/**/*.types.ts` contains no runtime/`export const` statements. Tier 2 — type-level compile check via `bun tsgo` equals baseline + 0. (No DB surface → `runInRollback` N/A; recorded.)
  - [x] 1.1.SEC **Security & Tenancy Audit**: No identity-bearing fields in types beyond documentary `GatewayRequestMetadata`; `requestId`/`idempotencyKey` explicitly documented as non-authorization headers (BOLA §6.1).
  - [x] 1.1.SR **Semantic Review**: No cross-layer imports (`shared/`, `frontend/`, `app/`); no dead exports; `readonly` on all fields; barrel purity (no re-export of non-type symbols).
  - [x] 1.1.IV **Instruction Verification**: Read `backend/types/AGENTS.md` naming/barrel rules and confirm `backend/types/errors/` DEV3-002 precedent shape matches.
  - [x] 1.1.OC **Outcome**: Write `outcome/1.1-outcome.md`; check boxes.

- [x] 1.2 Zero-Drift Database Verification
  - Run `bun validate:dbml` (GREEN, byte-identical `db/schema.dbml`); confirm `git diff` empty across `backend/db/schema/**`, `backend/db/migration/**`, `backend/drizzle*/**`; confirm `bun run db push` is NOT run.
  - No GraphQL enum registrations — confirm `backend/graphql/pothos/shared/enum.pothos.ts`, `backend/enum/**`, `backend/db/schema/enums.ts` untouched (plan §2.3 "Enums: None").
  - _Requirements: REQ-044, REQ-076_
  - [x] 1.2.SR **Semantic Review**: Any discovered schema gap → ❌ ledger row owned by DEV1-001; never patched inline.
  - [x] 1.2.OC **Outcome**: Write `outcome/1.2-outcome.md` with `validate:dbml` output + empty-diff evidence; check boxes.

---

## Phase 2: Backend Libraries & Services

- [x] 2.1 Implement `HealthCheckService` + `resolveAppVersion`
  - Create:
    - `backend/lib/gateway/version.ts` — `resolveAppVersion(): string` returning `process.env.APP_VERSION ?? process.env.npm_package_version ?? "dev"`; if Task 0.2 found env-config registration mandatory, register `APP_VERSION` per the env-config rule and record it here.
    - `backend/services/gateway/health-check.service.ts` — `HealthCheckService.getHealthStatus(): HealthCheckReturnType` → `{ status: "ok", service: "kottaby", version: resolveAppVersion(), timestamp: new Date().toISOString() }`. PURE: no DB, no env secrets beyond version, no ctx reads, no module-level mutable state.
    - `backend/lib/gateway/index.ts` — barrel (`./`-relative `export *` only).
  - Applicable AGENTS.md: `backend/services/AGENTS.md` (domain-namespace convention: `gateway/` subfolder), `backend/lib/AGENTS.md`.
  - _Requirements: REQ-012, REQ-003, REQ-037_
  - [x] 2.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/services/gateway/health-check.service.ts --lifecycle duplicates`; same for `version.ts` and the barrel (exit 0).
  - [x] 2.1.TE **Test Engineering**: `backend/services/gateway/health-check.service.test.ts` via `bun run test/scripts/run-test.ts`. Tier 1 (statement/branch): happy path; each fallback arm of `version ?? npm_package_version ?? "dev"` (env-manipulation fixture, restored after). Tier 2 (boundary): fresh ISO-8601 timestamp per call (two sequential calls parse + differ in monotonic harness), payload shape is exactly 4 keys (REQ-034). Tier 3 (chaos): `Promise.allSettled` storm of 50 parallel calls → all resolve, no cross-contamination. Tier 4 (security): payload contains no env values other than the allowed version chain, no filesystem paths (regex scan of the returned object).
  - [x] 2.1.SEC **Security & Tenancy Audit**: Disclose-surface audit — service returns ONLY status/service/version/timestamp (REQ-012, REQ-034); no identity, no tenancy reads, no DB writes (BOPLA purity REQ-031).
  - [x] 2.1.SR **Semantic Review**: Atomicity (pure function); env-config registration done if required; zero dead code; no `console.*`; deterministic shape with fresh timestamp not input-derived.
  - [x] 2.1.IV **Instruction Verification**: `backend/services/AGENTS.md` + `backend/lib/AGENTS.md` conventions honored (service in `services/`, helper in `lib/`).
  - [x] 2.1.OC **Outcome**: Write `outcome/2.1-outcome.md`; check boxes.

- [x] 2.2 Implement Gateway Library Modules (Allowlist, Inventory, Transport Guard)
  - Create:
    - `backend/lib/gateway/public-operations.ts` — `PUBLIC_OPERATION_NAMES` (`["login","refreshToken","logout","registerUser","recitationReadings","_health"] as const`), `PublicOperationName` derived type, `PUBLIC_OPERATIONS: ReadonlySet<string>`, `isPublicOperation` type guard (plan §3.3, D3). Per-entry security rationale comments citing REQ-017.
    - `backend/lib/gateway/route-inventory.ts` — classifying constant for every `app/api/**/route.ts` discovered in Task 0.2: `{ path, classification: "gateway" | "envelope" | "provider-ack-exempt" | "deferred" }` — single source shared by the canonical doc table (REQ-019).
    - `backend/lib/gateway/transport-guard.ts` — pure result-returning helpers (D5): `assertAllowedMethod`, `assertJsonContentType`, `assertWithinBodyLimit`, composing `guardTransport(request): Promise<TransportGuardResult>`; `MAX_GRAPHQL_BODY_BYTES` frozen constant (defined here if DEV3-002 did not provide it — Task 0.2 evidence decides; new constant documented in canonical doc).
  - NO throws anywhere in transport-guard (D5 — result unions, never throw-as-control-flow).
  - _Requirements: REQ-010 (steps 1–3), REQ-015, REQ-016, REQ-017, REQ-019; D3, D5_
  - [x] 2.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/lib/gateway/public-operations.ts --lifecycle duplicates`; same for `route-inventory.ts`, `transport-guard.ts` (exit 0).
  - [x] 2.2.TE **Test Engineering**: `backend/lib/gateway/*.test.ts` via `run-test.ts`. Tier 1: every guard branch (allowed POST; each disallowed method; present/absent/wrong content-type; at-limit/over-limit/missing content-length; parseable/malformed JSON). Tier 2 (boundary): body exactly at limit vs limit+1; allowlist: `isPublicOperation` true for all 6 entries, false for `"me"`, `"adminMutations"`, empty string, case-variants (`"Login"` must be FALSE — exact-match). Tier 3 (chaos): concurrent `guardTransport` calls (100×) produce independent results (REQ-040). Tier 4 (security): allowlist contains zero write-capable privileged ops (REQ-032 assertion constant); crafted headers cannot flip a transport verdict.
  - [x] 2.2.SEC **Security & Tenancy Audit**: BFLA — closed allowlist constant, any addition requires doc rationale (D3 rule comment); BOPLA — guard reads fixed header whitelist only; guard cannot mutate identity context (runs pre-context).
  - [x] 2.2.SR **Semantic Review**: Frozen constants; no module-level mutable Maps/Sets/counters mutated at runtime (ReadonlySet construction at load is bounded/immutable thereafter); no dynamic imports; no business logic leaking from services.
  - [x] 2.2.IV **Instruction Verification**: `backend/lib/AGENTS.md`; confirm no duplication of DEV3-002 request-id/envelope helpers (extend-in-place only; REQ-004).
  - [x] 2.2.OC **Outcome**: Write `outcome/2.2-outcome.md`; check boxes.

- [x] 2.3 Implement Static Assertion Suite (REQ-073 — bun:test, no server, no new dependencies, D9)
  - Create `backend/lib/gateway/static-assertions.test.ts` with file-content scans:
    - **A1**: no `await import(` substring in any `backend/graphql/{query,mutation,pothos}/**` file.
    - **A2**: no `values: [` literal-array enum registration in any `backend/graphql/pothos/**/*.pothos.ts`.
    - **A3**: no `console.` call site in `backend/lib/gateway/**`, `app/api/graphql/route.ts`, `app/api/health/route.ts`, `backend/services/gateway/**`.
    - **A4**: every discovered `app/api/**/route.ts` appears in the `route-inventory.ts` registry (cross-check — doc table and registry are one source).
    - **A5**: `backend/types/gateway/**/*.types.ts` contain zero runtime exports; no i18n/other-layer imports beyond allowed set.
  - Negative fixtures: verify each assertion FAILS on a crafted temp fixture (proves the scan is not vacuous).
  - _Requirements: REQ-073, REQ-018, REQ-019; D9_
  - [x] 2.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/lib/gateway/static-assertions.test.ts --lifecycle duplicates` (exit 0).
  - [x] 2.3.TE **Test Engineering**: Tier 1 — each assertion executes and currently passes on the real tree. Tier 2 — each assertion has a proven failing negative fixture. Tier 3 — glob iteration is deterministic (sorted) so CI/local parity holds. Tier 4 — scans never write to disk; read-only traversal.
  - [x] 2.3.SEC **Security & Tenancy Audit**: A4 inventory completeness is itself a security gate (no unclassified attack surface, REQ-019); A3 enforces the no-`console.*` disclosure rule (REQ-034).
  - [x] 2.3.SR **Semantic Review**: Regex patterns escaped correctly; no false positives on comments (document accepted lexical caveat in outcome — D9 trade-off); test runs in `test:graphql`-adjacent stack and DEV3-001 `tests` stage.
  - [x] 2.3.IV **Instruction Verification**: bun:test conventions; test placed beside library per existing test-colocation rules.
  - [x] 2.3.OC **Outcome**: Write `outcome/2.3-outcome.md`; check boxes.

- [x] 2.M Mid-Point Review Gate
  - Verify: Phase 1–2 complete; ALL new modules green through QL/TE/SEC/SR/IV; `bun tsgo` / `bun biome:check` / lint counts still equal Phase 0 baseline + 0; `deferred-items.md` committed with pre-seeded rows only; no file outside plan §4.1 inventory touched.
  - Deviations desynced between spec REQ rows and tasks: reconcile NOW (update tasks, re-baseline only the affected fixture subset) before Phase 3.
  - [x] Write `ai/plans/sprint_0/dev3-003-api-gateway-routing-skeleton/outcome/mid-point-review-outcome.md` — landed as dashboard stub aliasing the full gate report `outcome/2M-outcome.md` (Task ID C1-2M). Implementation of Phase 3 MUST NOT start until this exists.

---

## Phase 3: GraphQL Resolvers & API Handlers

- [x] 3.1 Implement `_health` GraphQL Surface + Schema/Codegen Sync
  - Create:
    - `backend/graphql/pothos/shared/health.pothos.ts` — `HealthCheckPothosObject = gqlSchemaBuilder.objectRef<HealthCheckReturnType>("HealthCheck").implement({...})` with `t.exposeString` for all four fields; canonical type import from `@/backend/types`; NO local type literal (CRITICAL), no `id` field (embedded value object, plan §3.1/D4).
    - `backend/graphql/query/health.query.ts` — `gqlSchemaBuilder.queryField("_health", t => t.field({ type: HealthCheckPothosObject, resolve: () => HealthCheckService.getHealthStatus() }))`. NO `authScopes` key (deliberate; allowlisted, REQ-017/060). NO ctx reads, NO DB, NO DataLoader.
  - Modify: `backend/graphql/query/index.ts` — add side-effect import for `./health.query` (existing barrel convention).
  - Run `bun run generate:gqlSchema && bun codegen`; verify diff contains ONLY `_health` + `HealthCheck` with every pre-existing surface byte-identical; commit generated artifacts (`schema.graphql`, `frontend/graphql/generated/gql/graphql.ts`) in the same change set (REQ-060 gate).
  - _Requirements: REQ-012, REQ-060, REQ-061; D4_
  - [x] 3.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/pothos/shared/health.pothos.ts --lifecycle duplicates`; same for `health.query.ts` (exit 0).
  - [x] 3.1.TE **Test Engineering**: (integration-level proof lives in Task 5.1; here Tier 1) schema-build unit assertion — built schema contains `Query._health: HealthCheck!` with all four `String!` fields and zero new mutations/enums (REQ-060 "exactly one addition"); codegen diff check scripted.
  - [x] 3.1.SEC **Security & Tenancy Audit**: `_health` intentionally scopeless AND present in `PUBLIC_OPERATIONS` (1:1 agreement, REQ-072); resolvers delegate-only (REQ-020); `_health` cannot leak internals (payload audited in 2.1.SEC).
  - [x] 3.1.SR **Semantic Review**: No resolver business logic beyond delegation; no `await import(`; side-effect import only; canonical-type-backed object.
  - [x] 3.1.IV **Instruction Verification**: `backend/graphql/AGENTS.md` (query/mutation/pothos triad, side-effect registration, single canonical object-type rule); `backend/graphql/pothos/AGENTS.md` and `backend/graphql/query/AGENTS.md` if present.
  - [x] 3.1.OC **Outcome**: Write `outcome/3.1-outcome.md` with codegen diff evidence; check boxes.

- [x] 3.2 Restructure `app/api/graphql/route.ts` into the Seven-Step Pipeline
  - Modify `app/api/graphql/route.ts` to implement REQ-010's canonical order (D1, D5, D7):
    1. `guardTransport(request)` → on `ok:false` map kind → real HTTP status + DEV3-002 envelope + `requestId` (`METHOD_NOT_ALLOWED`→405 + `Allow: POST`; `UNSUPPORTED_CONTENT_TYPE`→400; `PAYLOAD_TOO_LARGE`→413; `MALFORMED_JSON`→400) and RETURN IMMEDIATELY (engine never invoked).
    2. `requestId = resolveRequestId(request.headers)` (DEV3-002; honor `X-Request-Id`, else `crypto.randomUUID()`).
    3. Capture `idempotencyKey = headers["X-Idempotency-Key"] ?? null` (propagation-only).
    4. `ctx = await gqlContextFactory(request)` extended with requestId/idempotencyKey (see 3.3).
    5–6. Invoke engine: validate → scopeAuth/authScopes → resolver (inside Apollo execution; no reordering by route code).
    7a-7b. `finalizeGraphqlErrors(result, { locale, requestId })` THEN merge every `ctx.authCookieOut` entry via `headers.append("Set-Cookie", c)` — NEVER `headers.set` — executed UNCONDITIONALLY (error paths included, REQ-042).
    7c. Return JSON response (Apollo convention HTTP 200 for domain errors).
  - Export explicit handlers (`PUT`/`DELETE`/`PATCH` and non-enabled `GET`) returning the same guarded 405 envelope (not Next.js default export-absent behavior); `GET` handling env-gated per D6/D7 — mutations-over-GET rejected in every environment.
  - Envelope messages for transport failures come from the compile-time i18n `errors` namespace via `getServerTranslations(locale, "errors")` (REQ-051; verify keys exist in Task 4.2).
  - ZERO business logic in the handler (REQ-020 — composition only).
  - _Requirements: REQ-010, REQ-011, REQ-013, REQ-014, REQ-015, REQ-016, REQ-020, REQ-033, REQ-034, REQ-042, REQ-051; D1, D5, D7_
  - [x] 3.2.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts app/api/graphql/route.ts --lifecycle duplicates` (exit 0).
  - [x] 3.2.TE **Test Engineering**: Full behavioral proof deferred to Task 5.1's integration matrix; here handler-unit tier via injected fakes: ordering assertion (transport rejection never constructs context — spy-based), cookie-merge-unconditional-on-error probe (REQ-042), 405 `Allow: POST` header assertion, 400/413 envelope shape + `requestId` presence. Boundaries: empty body, whitespace-only body, content-length missing.
  - [x] 3.2.SEC **Security & Tenancy Audit**: (BOLA) identity remains exclusively factory-derived — no header/arg path to identity (REQ-030); (BOPLA) context assembly whitelist only (REQ-031); no stack/SQL/env/path leakage on any failure path (REQ-034); envelope uses DEV3-002 helpers, never hand-rolled.
  - [x] 3.2.SR **Semantic Review**: Composition purity (no domain imports, no service imports — only lib/envelope/factory/engine); `headers.append` only; no module-level mutable state; request-scoped everything (REQ-040).
  - [x] 3.2.IV **Instruction Verification**: `app/AGENTS.md`, `app/api/**` route conventions; DEV3-002 `docs/graphql/error-response-contract.md` consumed, not forked (REQ-004).
  - [x] 3.2.OC **Outcome**: Write `outcome/3.2-outcome.md`; check boxes.

- [x] 3.3 Extend `gqlContextFactory` In-Place (requestId + idempotencyKey)
  - Modify `backend/graphql/gqlContextFactory.ts` MINIMALLY: add `requestId` (if DEV3-002 did not land it) and `idempotencyKey` capture into the returned context. Extend in place; NO parallel helper, NO fork (D10, REQ-004). Cookie matrix, governance fail-closed path, and refresh-rotation behavior UNTOUCHED (REQ-011, REQ-033, REQ-035; plan §4.3).
  - If DEV2-001 substrate defect is discovered → ❌ ledger row + owning-stream fix, not a local workaround (protocol §7).
  - _Requirements: REQ-010 (step 4), REQ-030, REQ-031, REQ-043; D10_
  - [x] 3.3.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts backend/graphql/gqlContextFactory.ts --lifecycle duplicates` (exit 0).
  - [x] 3.3.TE **Test Engineering**: Tier 1 — context carries requestId/idempotencyKey when headers present/absent. Tier 2 — null idempotencyKey when header absent (not empty string). Tier 3 — concurrent factory calls (distinct users) produce isolated contexts (supports REQ-074). Tier 4 — both keys provably cannot influence identity fields (assert ctx identity equals factory-verified identity independent of header values).
  - [x] 3.3.SEC **Security & Tenancy Audit**: Deviation risk assessment — changes are additive context fields only; DEV2-001's 401 semantics, governance fail-closed, and cookie sizing matrix preserved verbatim (regression via existing DEV2-001 tests must stay green).
  - [x] 3.3.SR **Semantic Review**: Single source of truth preserved; no duplicated context-adjacent helper exists post-edit (grep evidence in outcome per REQ-004).
  - [x] 3.3.IV **Instruction Verification**: `backend/graphql/AGENTS.md`; `docs/auth/jwt-authentication-service.md` "What NOT to Do" section honored.
  - [x] 3.3.OC **Outcome**: Write `outcome/3.3-outcome.md` including DEV2-001 regression evidence; check boxes.

- [x] 3.4 Implement `/api/health` HTTP Probe + Introspection Gate + CORS Posture
  - Create `app/api/health/route.ts`: `GET` only → `return apiSuccessResponse(HealthCheckService.getHealthStatus(), { requestId: resolveRequestId(request.headers) })`. NO auth, NO GraphQL parse, NO DB. One of exactly two sanctioned probes (D2).
  - Modify GraphQL server configuration: explicit `introspection: NODE_ENV !== "production"` code-level constant (REQ-036, D6 — never ambient default).
  - CORS: introduce NO headers; document ambient same-origin-first posture in canonical doc (REQ-053, D8); preflight probe test belongs to Task 5.1.
  - _Requirements: REQ-013, REQ-036, REQ-053; D2, D6, D8_
  - [x] 3.4.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts app/api/health/route.ts --lifecycle duplicates` (exit 0).
  - [x] 3.4.TE **Test Engineering**: Tier 1 — GET returns 200 + envelope `{ data, requestId }` with the exact 4-field payload; `requestId` honors inbound `X-Request-Id`. Tier 2 — non-GET method on `/api/health` returns 405 (Next.js semantics documented). Tier 4 — payload disclosure regex scan (no path/env/secrets).
  - [x] 3.4.SEC **Security & Tenancy Audit**: No auth requirement is INTENTIONAL (LB probe) and matches the allowlist posture; introspection gate is code-explicit not ambient; no wildcard `Access-Control-Allow-Origin` introduced (REQ-053).
  - [x] 3.4.SR **Semantic Review**: Pure composition; no `console.*`; envelope helper used (not hand-rolled JSON); third health surface provably absent (grep for other `health` routes in outcome).
  - [x] 3.4.IV **Instruction Verification**: `app/AGENTS.md` route conventions; DEV3-002 envelope helper contract.
  - [x] 3.4.OC **Outcome**: Write `outcome/3.4-outcome.md`; check boxes.

---

## Phase 4: Frontend GraphQL Documents & i18n Contracts (No UI Views — see pipeline note)

- [x] 4.1 Apollo Cache Policy for `HealthCheck` (+ Document Deferral Decision)
  - Modify `frontend/providers/apollo/apolloCache.ts`: add `HealthCheck: { keyFields: false }` to `typePolicies` + one policy-list comment (embedded-type normalization policy, REQ-061, D4).
  - Decide (evidence-based) whether any current consumer requires `healthCheckQueryDocument` at `frontend/graphql/sharedDocuments/shared/health.documents.ts`:
    - If YES: create it — `gql` imported from `@apollo/client`, `TypedDocumentNode<HealthCheckQuery>`, no second type param (no-arg query), barrel-registered per `frontend/graphql/sharedDocuments/AGENTS.md` naming rules.
    - If NO: mark the REQ-062-tail pre-seeded ledger row ✅-targeted with owner "first consumer (DEV3-001 CI smoke / observability tooling)" and record the decision in the outcome.
  - NO new components, hooks, stores, pages, navigation, or MUI surface (plan §5).
  - _Requirements: REQ-061, REQ-062, REQ-063_
  - [x] 4.1.QL **Quality Loop**: `bun run scripts/health/sub-loop.ts frontend/providers/apollo/apolloCache.ts --lifecycle duplicates` (+ document file if created) (exit 0).
  - [x] 4.1.TE **Unit / Component Tests**: Tier 1 — cache-policy assertion: initialised `InMemoryCache` config contains `HealthCheck.keyFields === false` (prevents "Cache data may be lost" warnings for future consumers). If the document exists: compile-check via codegen types; mock execution through Apollo `MockedProvider` returning the 4-field payload (no network).
  - [x] 4.1.BF **Agent-Browser Functional Self-Loop**: ⏭️ **N/A — recorded.** Ticket ships no rendered UI, form, route, modal, or interactive workflow (plan §5; protocol note). Network-level functional proof is executed headlessly via the integration harness in Phase 5 instead of a page-level browser loop.
  - [x] 4.1.BS **Agent-Browser Visual & Styling Self-Loop**: ⏭️ **N/A — recorded.** Zero visual surface exists to screenshot (no Typography/Box/Grid, no MUI tokens, no RTL mirroring surface). Re-affirmed at Phase 6 review-frontend wave.
  - [x] 4.1.SR **Semantic Review**: No direct style props (none present); no hardcoded strings/colors (none introduced); policy entry follows existing comment/format style; any document uses `TypedDocumentNode` + barrel convention.
  - [x] 4.1.IV **Instruction Verification**: `frontend/graphql/AGENTS.md` embedded-type policy; `frontend/graphql/sharedDocuments/AGENTS.md` (if document created); `mobile-desktop.instructions.md` (confirms no mobile surface).
  - [x] 4.1.OC **Outcome**: Write `outcome/4.1-outcome.md` with the deferral/creation decision + rationale; check boxes.

- [x] 4.2 i18n Transport-Message Key Verification (ar + en parity)
  - Verify the compile-time `errors` namespace contains every message key the transport envelope emits (e.g., `errors.badRequest` and any method/size variants introduced by the final transport matrix); if any key is missing, add it to BOTH `ar` and `en` locale sources in `shared/locale/` (the compile-time `MessageSchema` gate enforces parity).
  - Confirm the `_health` payload exemption (REQ-002) is documented and NO locale key is created for health payload constants.
  - Confirm ZERO `next-intl` imports / `getBackendTranslations` / `shared/messages/` references in touched files.
  - _Requirements: REQ-002, REQ-051_
  - [x] 4.2.QL **Quality Loop**: sub-loop on every modified locale file (exit 0); run the compile-time i18n validation script per `shared/locale/` AGENTS conventions.
  - [x] 4.2.TE **Test Engineering**: ar+en key-parity test for the `errors` namespace (existing or extended); envelope-rendering test uses the localized message, never a literal.
  - [x] 4.2.SEC **Security & Tenancy Audit**: Envelope messages are generic (no internals echoed into localized strings, REQ-034).
  - [x] 4.2.SR **Semantic Review**: Property-access consumption (`t.badRequest` pattern in server contexts via `getServerTranslations`), never string concat to keys; no dead keys added.
  - [x] 4.2.IV **Instruction Verification**: `shared/locale/AGENTS.md` conventions (server-graphql resolver context uses `ctx.t`; route handlers use server locale helpers).
  - [x] 4.2.OC **Outcome**: Write `outcome/4.2-outcome.md`; check boxes.

---

## Phase 5: Integration & Differential Testing

- [x] 5.1 GraphQL Gateway Integration Matrix (REQ-071)
  - Create `frontend/graphql/test/gateway/gateway.integration.test.ts` via `setupTestServerLifecycle` + `testClient`, executed with `bun run test/scripts/run-test.ts`, proving ALL of:
    - (a) `_health` unauthenticated → transport-200 + full `{ status, service, version, timestamp }` payload.
    - (b) unknown GraphQL field → BAD_REQUEST-family failure (never 404, never unmasked 500) (REQ-014).
    - (c) malformed JSON body → HTTP 400 envelope bearing `requestId`; engine log shows no execution.
    - (d) `PUT`/`DELETE` (`PATCH` also) → 405 with `Allow: POST`; `GET` default → 405 (REQ-016).
    - (e) unauthenticated protected op (`me`) → `extensions.code = "UNAUTHORIZED"` (transport-200).
    - (f) authenticated-but-forbidden role-gated op → `extensions.code = "FORBIDDEN"` with resolver side-effects provably absent.
    - (g) synthetic raw non-DomainError throw (test-only forced failure fixture, not a shipped public field) → masked `INTERNAL_SERVER_ERROR`; payload scanned for stack/SQL/env/path leakage (REQ-034); captured log contains original error + SAME requestId.
    - (h) `X-Request-Id: <fixed>` inbound → echoed in error `requestId` and log correlation.
    - (i) `login` happy path → exactly three `Set-Cookie` headers (`session_id`, `refresh_token`, `access_token`) with DEV2-001 matrix flags (attributes from DEV2-001 fixtures).
    - `/api/health` GET → 200 + envelope; unknown path (`/api/definitely-not-a-route`) → 404, no engine activity.
    - Preflight probe: no wildcard `Access-Control-Allow-Origin` on authenticated surfaces (REQ-053).
    - Production-config introspection denied; non-prod introspection permitted (REQ-036).
    - `logout` forced-failure variant → clearing `Set-Cookie` headers STILL present (REQ-042).
    - `X-Idempotency-Key` header → present in resolved context (REQ-043, propagation assertion).
  - If any test touches the DB: `runInRollback` + `tx` everywhere + `entity-setup.ts` fixtures only + `expectRepoError` helper (REQ-070).
  - _Requirements: REQ-011, REQ-013, REQ-014, REQ-015, REQ-016, REQ-033, REQ-034, REQ-036, REQ-042, REQ-043, REQ-053, REQ-070, REQ-071_
  - [x] 5.1.QL **Quality Loop**: sub-loop on the test file (exit 0).
  - [x] 5.1.SEC **Security & Tenancy Audit**: Leakage-scan assertions are real regex checks, not comment-only; 401-vs-403 pair is asserted on the SAME field family (exclusivity REQ-033).
  - [x] 5.1.SR/IV**: Harness API per `frontend/graphql/test/` conventions; no test-only surface ships in production builds (fixture gating documented in outcome).
  - [x] 5.1.OC **Outcome**: Write `outcome/5.1-outcome.md` with per-matrix-row pass evidence; check boxes.

- [x] 5.2 Allowlist Coverage Gate (REQ-072 — BLOCKING)
  - Create `frontend/graphql/test/gateway/allowlist-coverage.test.ts` (or extend DEV2-002's D3 test in place — decision recorded): introspect the built schema and assert (1) every query/mutation field either declares an authScope or appears in `PUBLIC_OPERATIONS`; (2) 1:1 exact agreement between the allowlist constant and the schema's unscoped set (drift in either direction FAILS); (3) no `grantRole*`/`assignRole*`/`elevate*` mutation exists under any non-admin scope.
  - Wire the suite into `bun run test:graphql` and confirm it executes inside the DEV3-001 CI `tests` stage (local↔CI parity evidence in outcome).
  - _Requirements: REQ-017, REQ-032, REQ-072; D3_
  - [x] 5.2.QL **Quality Loop**: sub-loop on the test file (exit 0).
  - [x] 5.2.SR/IV**: Negative-fixture proof (temporarily scoped-out test field in a sandbox build or synthetic schema proves the gate actually fails on drift — documented in outcome).
  - [x] 5.2.OC **Outcome**: Write `outcome/5.2-outcome.md`; check boxes.

- [x] 5.3 Concurrency & Chaos Tier (REQ-074)
  - Create `frontend/graphql/test/gateway/concurrency.chaos.test.ts`:
    - Two CONCURRENT logins for distinct users → response A carries only A's three cookies; response B carries only B's; no cross-contamination (REQ-040/037).
    - `Promise.allSettled` storm (≥50) of `_health` → all 200, each with a fresh ISO timestamp.
    - Concurrent refresh-rotation race → converges per DEV2-001 REQ-021 stale-JTI contract (unchanged by gateway).
    - requestId uniqueness across storm (no collision, no shared counter).
  - _Requirements: REQ-037, REQ-040, REQ-041, REQ-074_
  - [x] 5.3.QL **Quality Loop**: sub-loop on the test file (exit 0).
  - [x] 5.3.SR/IV**: Storm sizes deterministic in CI (seeded count); no timing-flake tolerances (assert structural invariants only).
  - [x] 5.3.OC **Outcome**: Write `outcome/5.3-outcome.md`; check boxes.

- [x] 5.4 Coverage & Delta Gate (REQ-075, REQ-076)
  - Statement+branch coverage = 100% on ALL new files (types-covered branches, both health surfaces, transport-failure paths, cookie-merge error path).
  - Final baseline comparison: `bun tsgo`, `bun biome:check`, `bun run scripts/lint-service.ts --json --id post` produce ZERO new findings vs. Phase 0 baseline (excluding frozen pre-existing modified-file set); `bun validate:dbml` green; per-file sub-loop log complete.
  - Any residual failing state → ❌ ledger row + explicit owner, OR fix-and-re-run until gate passes.
  - _Requirements: REQ-075, REQ-076, REQ-083_
  - [x] 5.4.OC **Outcome**: Write `outcome/5.4-coverage-and-delta-outcome.md` with machine outputs attached; check boxes.

---

## Phase 6: Post-Implementation Review Waves (parallel, then deferred-items check)

- [x] 6.1 Review Wave — review-types
  - Scope: `backend/types/gateway/**`, barrels, `HealthCheckReturnType` naming/purity, union-vs-enum rule (`TransportErrorKind`), zero-runtime-export enforcement, root barrel wiring.
  - Findings routed as ❌ (fix now) or ⚠️→owner ledger rows. Write `outcome/6.1-review-types-outcome.md`.
  - [x] 6.1.OC check boxes.

- [x] 6.2 Review Wave — review-backend
  - Scope: `app/api/graphql/route.ts` seven-step ordering vs REQ-010, `gqlContextFactory` minimal-diff audit, transport-guard purity (D5), allowlist closure (D3), service purity (REQ-020/041), no module-level mutable state, no `console.*`, `headers.append`-only, layering (no `app/` imports from backend).
  - Verify REQ-033 401/403 non-remapping at route layer; REQ-035 unchanged rate-limit posture (existing fail-open tests green).
  - Write `outcome/6.2-review-backend-outcome.md`. [x] 6.2.OC check boxes.

- [x] 6.3 Review Wave — review-frontend
  - Scope: `apolloCache.ts` diff (single policy line only), optional document conventions, RE-CONFIRM the zero-UI determination of plan §5 — if ANY rendered surface was introduced during implementation, STOP, retro-fit the full UI-task pipeline (`.BF` functional browser loop across workflows + `.BS` screenshot loop at 1440×900 / 768×1024 / 375×812 × en-LTR/ar-RTL with MUI token inspection) before close.
  - Write `outcome/6.3-review-frontend-outcome.md`. [x] 6.3.OC check boxes.

- [x] 6.4 Review Wave — pentester
  - Scope: REQ-030–REQ-037 behavioral re-proof against the built boundary — identity sourcing (no header-to-identity path), allowlist closedness verdict, leakage probe (g) re-run with adversarial payloads, introspection prod-deny, 405/413 bypass attempts (chunked vs content-length mismatch), preflight/wildcard-ACAO check, governance-vs-context single-enforcement-point confirmation (A.7/REQ-033).
  - Write `outcome/6.4-pentester-outcome.md`; every HIGH/CRITICAL is ❌ and blocks completion.
  - [x] 6.4.OC check boxes.

- [x] 6.5 Deferred-Items Verification
  - Reconcile every review-wave finding into `deferred-items.md`: confirm pre-seeded rows 1–7 are ✅-targeted with owner tickets; confirm zero UNOWNED ❌/⚠️ remain; confirm `demoLogin` env-flag verification result (from Task 0.2) is recorded; confirm any newly-discovered `app/api/**/route.ts` has been appended to the inventory (registry + doc table updated).
  - [x] 6.5.OC Write `outcome/6.5-deferred-items-outcome.md`; check boxes.

---

## Phase 7: Knowledge Propagation & Documentation

- [x] 7.1 Canonical Doc — `docs/graphql/api-gateway-and-routing.md`
  - Structure: Why → Pattern → Rules → What NOT to Do → Rollout Summary → Related Documents (per canonical-doc template).
  - Content MUST cover: seven-step processing order (REQ-010), transport failure matrix (REQ-015 incl. `MAX_GRAPHQL_BODY_BYTES` value), public allowlist + per-entry rationale + "how to add an entry" rule (REQ-017), the TWO sanctioned health probes + explicit "no third health surface" rule (REQ-012/013), the **stream route-registration contract** (REQ-018 — resolver module placement, side-effect barrels, no `await import(`, Pothos object/DataLoader rules, single enum-registration site, authScope declaration requirement, codegen-in-same-commit rule), the non-GraphQL route inventory table sourced from `route-inventory.ts` (REQ-019), CORS/method/introspection policies (D6/D7/D8), explicit N/A affirmations (no REST route tree, no WebSocket transport, `escapeLikeWildcards` N/A here with forward contract to DEV3-008/009), and the forward note that any future health-status tooling UI follows the standard responsive/MUI matrix.
  - [x] 7.1.SR **Semantic Review**: Matrix tables appear HERE only — layer AGENTS files must not duplicate them (content-policy rule).
  - [x] 7.1.OC Write `outcome/7.1-outcome.md`; check boxes.
  - _Requirements: REQ-080, REQ-018, REQ-019_

- [x] 7.2 AGENTS.md Propagation
  - `backend/graphql/AGENTS.md` — add 1–2 line gateway/registration-contract rule linking the canonical doc (NO code, NO matrix tables).
  - `app/AGENTS.md` — add one-line pointer for `app/api/**` route envelope conventions → canonical doc.
  - Root `AGENTS.md` Important References — add one-line entry for the canonical doc.
  - If an enqueued layer file mentions gateway/transport rules inconsistently → ledger ⚠️ with owner instead of editing beyond scope.
  - [x] 7.2.OC Write `outcome/7.2-outcome.md`; check boxes.
  - _Requirements: REQ-081_

- [x] 7.3 Outcome Synthesis & Completion Gate
  - Synthesize all `outcome/*.md` files into the final close-out summary (files changed, verification ledger, carry-forward knowledge for DEV3-001 CI wiring, DEV3-008/009 search consumers, Sprint-1 stream consumers of REQ-018).
  - Run the completion gate and attach machine output: `grep -c "❌\|⚠️" ai/plans/dev3-003-api-gateway-routing-skeleton/deferred-items.md` MUST output **0** (REQ-083 — every pre-seeded row carries an explicit owner + ✅/targeted status per the template semantics verified in 6.5).
  - Final evidence bundle: baseline-vs-post diff (zero new errors), `validate:dbml` green, codegen-diff limited to `_health`/`HealthCheck`, REQ-071/072/074 suite results, per-file sub-loop exit-0 log.
  - Mark REQ-083 complete; confirm ALL tasks above are `[x]`.
  - [x] 7.3.OC Write `outcome/7.3-completion-gate-outcome.md`; check boxes.
  - _Requirements: REQ-076, REQ-082, REQ-083_

---

## Cross-Reference Summary

| Phase | Tasks | Primary REQs |
|---|---|---|
| Phase 0 | 0.1, 0.2, 0.3 | REQ-001..004, REQ-019, REQ-082–083 |
| Phase 1 | 1.1, 1.2 | REQ-003, REQ-044, REQ-076 |
| Phase 2 | 2.1, 2.2, 2.3, 2.M | REQ-010..019, REQ-037, REQ-073 |
| Phase 3 | 3.1–3.4 | REQ-010..016, REQ-020, REQ-030..034, REQ-036, REQ-042, REQ-043, REQ-051, REQ-053, REQ-060–061 |
| Phase 4 | 4.1, 4.2 | REQ-002, REQ-051, REQ-061–063 |
| Phase 5 | 5.1–5.4 | REQ-070..076 |
| Phase 6 | 6.1–6.5 | All; wave scoping per REQ-003/010/020/030–037 |
| Phase 7 | 7.1–7.3 | REQ-018, REQ-080–083 |
