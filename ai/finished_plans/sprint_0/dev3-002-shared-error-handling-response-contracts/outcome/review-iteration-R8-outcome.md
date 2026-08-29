# DEV3-002 — Review Iteration R8 Outcome (DOCUMENTATION-vs-CODE CONSISTENCY)

Task ID: R8 · fresh independent DOCUMENTATION consistency auditor · no runtime code touched.
Scope read tight: canonical contract doc FULL · plan-completion §carry-forward · deferred-items ·
backend/frontend/shared/root `AGENTS.md` sections · new consumers (GraphQLErrorSurfaceHost,
landing polish, locale-default-ar, safeRedirect hardening) vs HEAD (`a1a652a`+doc edits).

## Verdict lines

- **0 code-level contract violations** — the new consumers honor every clause they touch.
  `GraphQLErrorSurfaceHost` consumes ONLY the sanctioned seam (`registerGraphQLErrorActionListener`
  from `frontend/providers/apollo/utils.ts:354`; zero private re-mapping of codes → verified
  against its full source); forms keep the direct-call path via `mutationFieldErrors.ts`.
  No HIGH finding. **No code changes made** ⇒ QL/tsgo code gates not triggered by this task.
- **Doc truth deltas at HEAD: 2 DRIFTED claims + 3 DOC-GAP/stale entries — ALL FIXED (docs-only).**
- Live probes (:3000 preserved): P1 `GET /` 200; P2 set-locale GET bad locale → REST envelope
  `{error:{code,message,requestId}}` HTTP 400, producer-localized AR copy (confirms default-
  locale=ar canonical upstream landing carries through envelope correctly); P3 POST /api/graphql
  bad JSON → transport-local `{errors:[{extensions:{code:"GRAPHQL_PARSE_FAILED",requestId}}]}`
  HTTP 400 (exemption row + preset-passthrough requestId attach BOTH confirmed live).
- Mandated-runner spot proofs (HEAD): set-locale-route **27 pass / 0 fail** · safeRedirect
  **5 / 0** · error-link.map **29 / 0 / 98** — completion-gate counts in §5 table remain accurate.

## Claim-by-claim audit — docs/graphql/error-handling-contract.md @ HEAD

| # | Claim under audit | Verdict | Evidence (file:line) |
|---|---|---|---|
| 1 | REQ-010 nine-category ↔ HTTP-status table | MATCHED | `backend/lib/errors/error-code-taxonomy.ts:41-51` (400/401/403/409/409/422/429/503/500 exact) |
| 2 | Legacy alias encoded once, normalized only in derivation layers | MATCHED | taxonomy `LEGACY_ERROR_CODE_ALIASES` :59-61; declared local mirror `error-link.map.ts:60-67` |
| 3 | Extending recipe: union + self-map `satisfies Record<ErrorCode,ErrorCode>` exhaustiveness lock | MATCHED | taxonomy :68-78 |
| 4 | Custom domain codes never resolve via taxonomy; REST custom base `BAD_REQUEST` fallback | MATCHED | `normalizeErrorCode` null-fallthrough :113-115; `api-response.ts:279-285` |
| 5 | Request-id acceptance (trim ≤128, single-value comma disqualifier, control-char-free, else UUIDv4, hostile dropped wholesale) | MATCHED | `backend/lib/api/api-response.ts:69-153` |
| 6 | Exact envelope shapes `{data,requestId}` / `{error:{code,message,requestId[,fields]}}`, no synthesized `details` | MATCHED | api-response.ts:164-209 (details key never written); live probe P2 |
| 7 | Exemptions register complete & accurate (graphql transport-local; set-locale GET redirect-success w/ enveloped GET errors; webhook row future-pending) | MATCHED | `app/api/set-locale/route.ts:15-29,133-168`; live probes P2/P3 |
| 8 | Exactly ONE `createGraphqlErrorsFinalizerPlugin()` in module-scope ApolloServer plugins array | MATCHED | `app/api/graphql/route.ts:92-101` single call site |
| 9 | Preset passthrough family AS-IS + requestId attach (+live parity) | MATCHED | preset set `error-masking.ts:611-616`; P3 shows GRAPHQL_PARSE_FAILED w/ requestId over-wire |
| 10 | Redaction bounds depth 6 / items 64 w/ `[DEPTH_LIMITED]`/`[ITEMS_LIMITED]`; operationName >128 wholesale drop | MATCHED | error-masking.ts:74-95; `graphqlErrorsFinalizer.ts:141-157` (`OPERATION_NAME_MAX_LENGTH=128`) |
| 11 | Domain rejects observed on silent `logDomainError`, debug under TEST_SERVER=1; masked items rebuilt `includeDiagnostics:false` | MATCHED | error-masking.ts:526-533,690,860-861 (grep snapshot of saved module dump) |
| 12 | `ctx.requestId` composed exactly once inside `createGraphQLContext` via shared resolver | MATCHED | `gqlContextFactory.ts:27,143,190` |
| 13 | UNAUTHORIZED scope guard `/`, `/login`, `/register` suppresses login-hijack redirect | MATCHED | `frontend/providers/apollo/utils.ts:229-237` (`isPublicAuthExemptPath`) |
| 14 | REQ-061 row parity (FORBIDDEN split, VALIDATION pairs-carried, DUPLICATE success-equivalent flag, ISE correlation-guidance flag, counter-free RATE_LIMITED copy, else-null fall-through) | MATCHED | `error-link.map.ts:205-330,357-366`; suite 29/0 live |
| 15 | Component-seam list: form-side helper signature `applyProjectedFieldErrors(sink, whitelist)` | **DRIFTED → FIXED** | actual `(projectedPairs, isAcceptedField, sink)` `mutationFieldErrors.ts:147-151`; other listed symbols verified verbatim (`fieldError.ts:80,107,128`; `FieldErrorContractEntry` :32) |
| 16 | FORBIDDEN-query renderer ownership post-host (PermissionDeniedFallback vs pinned banner) | DOC-GAP → FIXED (Surface-host subsection) | `GraphQLErrorSurfaceHost.tsx:33-37,82-86,194-227`; mount `AppClientProviders.tsx:51-55` |
| 17 | Host surface behaviors documented anywhere in contract doc (stack cap/y-offset, monotonic ids, autohide, neutral duplicate tone, correlation chip condition) | DOC-GAP → FIXED | host :58-59,73,90-94,104-163,170-193; was absent pre-R8 |
| 18 | `registerGraphQLErrorActionListener` usage rule (single slot; page forms must not register) | DOC-GAP → FIXED | seam utils.ts:352-360; ownership rule lived only in module headers (`mutationFieldErrors.ts:14-17`) — now in canonical doc + frontend/AGENTS.md |
| 19 | §5 suite-guard matrix paths/guard descriptions | MATCHED (spot-proven at HEAD) | runs logged below; safeRedirect hardening (backslash-fold + scheme smuggle) still covered by suite desc |
| 20 | Related-documents layer pointer "`backend/graphql/AGENTS.md` §Boundary finalization" | **DRIFTED → FIXED** | no such heading exists (heading scan); rules live in "## DomainError → GraphQLError extensions.code", backend/graphql/AGENTS.md:138-142 — pointer re-worded to real anchor |

## Cross-doc consistency sweep

- `docs/graphql/domain-error-extensions-code.md` superseded-by-reference blockquote (**ACCURATE**):
  transport surfaces still point solely at the contract doc; throw-convention content not duplicated
  into either side; internal contract-doc link resolves.
- `shared/AGENTS.md` errors-namespace note (**MATCHED**): `shared/locale/types/errors/index.ts`
  exposes EXACTLY the listed 18 keys; landing-polish i18n additions did not touch this namespace;
  `forbiddenRole` (used by host banner title) present.
- `root AGENTS.md` Important References entry line 454 (**VALID PATH**, description accurate);
  BLT-03 annotations intact at root:453.
- `backend/AGENTS.md` §Error Handling pointers (**ALL RESOLVE**): `@/backend/lib/api` barrel re-exports
  resolveRequestId/apiSuccessResponse/apiErrorResponse (`backend/lib/api/index.ts`); taxonomy path real.
- BLT-03 claimed file paths post-churn (**ALL EXIST**): backend/graphql · backend · backend/services ·
  backend/db/repo AGENTS.md files present; docs/auth/jwt-authentication-service.md + user-registration.md
  present; `frontend/views/AGENTS.md` / `frontend/components/ui/AGENTS.md` intentionally absent per
  BLT-09 amend-citations choice (parent coverage explicit — consistent).
- `deferred-items.md` ⚠️ rows recipe check: BLT-06 CI recipe ✓ precise; BLT-07 baseline command cited ✓;
  BLT-12 green-path invocation recorded ✓; BLT-13/BLT-14 runner commands ✓; BLT-05 gained explicit
  command via R8 annotation.
- INFO (no action): default locale `ar` (canonical) surfaced through P2's Arabic producer copy with no
  cookie/Accept-Language — contract text is locale-agnostic; no conflict to fix.

## Deferred-items quality fix (stale wording)

BLT-05 described the component-tier scaffold as absent (`test/ui/components` ENOENT …). At HEAD the
component tier EXISTS (TestWrapper/happydom-preload/translation-preload/next-dynamic-mock + render
suites incl. graph-ql-error-surface-host) with green mandated runs during R6–R7 (14/14; host 10/10),
while `test/ui/e2e/` and `test/ui/mobile-desktop-isolation.test.ts` are still missing ⇒ status stays
⚠️ Partial with an appended dated re-audit note separating landed-vs-remaining cells.

## Fixes applied (docs-only diff)

1. `docs/graphql/error-handling-contract.md` §Client mapping: corrected
   `applyProjectedFieldErrors(projectedPairs, isAcceptedField, sink)` + `projectMutationFieldErrors(err)`
   signatures; kept mirror-type sentence attached to Component seams paragraph.
2. Same doc: NEW subsection "§Client mapping › Surface host (`GraphQLErrorSurfaceHost`)" — mount rule
   (once, AppClientProviders/AuthProvider subtree), single-slot listener ownership + form direct-call
   division, toast stacking shell/y-offset rationale, cap 3 oldest-drop, monotonic ids, 6 s autohide,
   neutral-info duplicates, correlation-chip iff-flag, permission pinned-banner semantics, ignored kinds,
   retry-flag-not-button rule, idle-null SSR posture.
3. Same doc › Related Documents: layer-pointer repaired to real anchors (§DomainError → GraphQLError
   extensions.code; §The `errors` namespace; §Error surfaces & Apollo error mapping).
4. `frontend/AGENTS.md` §Error surfaces & Apollo error mapping: added "Surface host ownership" bullet
   (host = only listener consumer; forms must NOT register; link to canonical subsection).
5. `deferred-items.md` BLT-05: post-plan re-audit annotation (landed component tier w/ command +
   historical greens; remaining e2e/static gaps keep ⚠️ Partial).

## Regression safety

Docs-only delta (.md ×4 + new outcome/probe artifacts). Zero .ts/.tsx edits ⇒ no tsgo/biome-surface
change expected; HEAD spot suites above re-ran GREEN after edits. Dev server :3000 untouched
(probes were read-only curls). Landing/dashboard aesthetics untouched.

Artifacts: `qa-shots/dev3-002-R8/FINDINGS.md` (+ probes.txt) · this file.
