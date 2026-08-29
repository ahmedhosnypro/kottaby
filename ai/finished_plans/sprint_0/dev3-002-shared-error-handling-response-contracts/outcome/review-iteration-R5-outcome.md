# DEV3-002 — Review Iteration R5 Outcome (BACKEND/CONTRACT · live log correlation + stress)

Task ID: R5 · fresh independent backend/contract reviewer · LIVE-server verification pass on :3000
(turbopack dev, `dev.log`, `TEST_SERVER=1`). First iteration to prove the REQ-012/013 logging and
REQ-018 correlation guarantees **live against the running process** with byte-marker slicing of the
server log, plus a 20-way concurrent request-id burst. Zero source edits required.

## Mission verdicts

1. **M1 Log correlation — PASS.** Marker @149787 bytes → 6 probes (valid-anon / unknown-field /
   invalid-JSON / masked-500 login ×2 / masked-500 register w/ custom honored id) → new segment =
   11 lines: exactly **3** `[ERROR] Unhandled non-domain error masked at GraphQL boundary` lines for
   **3** masked responses — each line's `requestId` byte-matches its response body
   `errors[0].extensions.requestId` (`9cb4810b…`, hostile-honored `R5%0d%0a…128c`, custom
   `r5-m1-valid-client-correlation-id-0123456789abcdef`). One `[DOMAIN]` debug line carrying
   `code:"UNAUTHORIZED"` + matching requestId. Preset channels silent. Security sweep of every new
   line: no stack frames / SQL fragments / unredacted credential shapes; all three probe-injected
   secret literals absent from the log.
2. **M2 Request-ID stress — PASS.** 20 concurrent curls sharing one hostile 128-char id
   (CRLF-attempt patterns; delivered duplicated to trip the multi-value/comma disqualifier):
   20/20 HTTP 200 · 20/20 distinct freshly minted UUIDv4s · 0 collisions · 0 hostile echoes ·
   GET / = 200 after (server survived). Concurrency-safe `[DOMAIN]` correlation observed too.
3. **M3 Envelope differential — PASS, 0 divergences / 10 paths.** Success POST en/ar keyset-exact
   `{data:{locale}, requestId}`; GET redirect exemption honored (307 + Location + NEXT_LOCALE,
   empty body); forbidden cross-origin en+ar / malformed JSON / invalid locale body / GET
   missing-param / oversized 3 MB → `{error:{code,message,requestId}}` exact everywhere;
   origin-less POST fails closed to enveloped 403; Accept-Language localization honored
   (EN ↔ default ar).
4. **M4 Data-plane integrity guard — HOLDS.**
   `rg -n "await db|\.insert\(|\.update\(|execute\(" backend/lib/errors/ backend/lib/api/ backend/graphql/graphqlErrorsFinalizer.ts`
   → zero matches (exit 1). Output documented in `qa-shots/dev3-002-R5/data-plane-guard.txt`.
5. **Regression suites (mandated runner `bun run test/scripts/run-test.ts`) — ALL GREEN, once:**
   taxonomy 15/0 · masking 32/0 · api-response 39/0 · finalizer 14/0 · request-id 12/0 (**112 pass / 0 fail**).

## Findings

| # | Sev | Disposition | Summary |
|---|-----|-------------|---------|
| F-R5-M1 | PASS | ✓ | exactly-once correlated logging proven live (details above) |
| F-R5-M2 | PASS | ✓ | request-id wholesale-drop + per-response minting under 20-way concurrency |
| F-R5-M3 | PASS | ✓ | envelope shape byte-shape-compliant on every reachable set-locale path |
| F-R5-M4 | PASS | ✓ | error machinery touches no DB tables |
| OBS-R5-A | INFO | report-only | `/api/graphql` masked INTERNAL_SERVER_ERROR items ride HTTP 200 + structured errors[] (GraphQL-over-HTTP transport-local shape; REST envelope deliberately exempt per contract §3) — documented so access-log 200s beside `[ERROR] masked` lines aren't misread |
| OBS-R5-B | INFO | env note | raw CR/LF header bytes are rejected by Node's HTTP parser pre-application (bare 400, no log line) — app-layer acceptance rules were proven via comma/multi-value drop; `%0d%0a` inert sequences are correctly honored within ≤128 chars |

Defects fixed this iteration: **0** (none found needing code). Regressions introduced: none.

## Gates

tsgo project-wide exit 0 · suites 112/0 as above · anonymous `/register` smoke ×3 = HTTP 200
(100–205 ms) after all probing · oxlint/QL n/a (no source files touched in R5).

## Artifacts

- `qa-shots/dev3-002-R5/correlation-evidence.txt` (+ `raw/dev-log-new-segment.txt`, probe bodies/headers)
- `qa-shots/dev3-002-R5/request-id-stress.txt` (+ `raw/dev-log-m2-segment.txt`, 20 bodies)
- `qa-shots/dev3-002-R5/envelope-diff.txt`, `data-plane-guard.txt`
- Probe scripts kept reproducible: `m1-probes.sh`, `m1-analyze.py`, `m2-stress.sh`, `m3-envelope.sh`
- `FINDINGS.md` (full table), this outcome mirror, worklog entry `Task ID: R5`.
