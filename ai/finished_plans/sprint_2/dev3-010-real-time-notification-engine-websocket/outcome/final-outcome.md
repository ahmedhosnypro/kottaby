# DEV3-010 — Real-Time Notification Engine (WebSocket) — FINAL OUTCOME

**Plan:** `ai/plans/sprint_2/dev3-010-real-time-notification-engine-websocket`
**Branch:** `feat/dev3-010-real-time-notification-engine-websocket`
**Status:** ✅ COMPLETE — all phases executed, all gates green, plan closed.

---

## 1. Shipped Surface

**Backend engine (persist-first, push-second):**
- `NotificationEngine` (`backend/services/notifications/notification-engine.service.ts`) — emit surface (`emitForUser`/`emitForUsers`/`publishReceipts` with publish-after-commit + caller-tx receipt composition + fail-open idempotency on sha256 digest keys, 24h TTL) and inbox surface (`listMyNotifications` with filter/pagination coherence, `getMyUnreadCount`, `markRead` guarded + idempotent, `markAllRead` type-filtered)
- `NotificationRepository` (`backend/db/repo/notifications/`) — 7 single-statement methods, tx-last, shared predicate builder, guarded self-scope UPDATEs
- Fan-out transports (`backend/services/notifications/realtime/`) — port + in-process adapter + Redis pub-sub adapter (channel `kottaby:notifications:fanout`, runtime envelope guard) + env-seam selection factory
- WS sidecar (`backend/ws/notification-ws-server.ts` + `bun run ws`) — Bun-native, Origin-first CSWSH defense, cookie-only auth (4401), per-IP throttle (4429), bounded registry with global/per-user caps (1013/4009), 30s ping ×2-miss termination, 4KB inbound frame cap, graceful 1001 shutdown (drain-window race closed), O(recipients) delivery via per-user index

**GraphQL API (4 self-scoped operations, zero CUD):**
- Queries: `myNotifications(filter, limit, offset): NotificationListPage!`, `myUnreadNotificationCount: Int!`
- Mutations: `markNotificationRead(id: ID!): Notification!`, `markAllNotificationsRead(type: NotificationType): Int!`
- Pothos objects + enum registered once; SDL/codegen artifacts committed byte-identical; public-operation allowlist byte-unchanged (default-deny)

**Frontend (Apollo cache = single truth, no stores):**
- `useNotificationRealtime` hook — one cookie-handshake socket per authenticated shell, backoff 1s→30s + jitter, abort on 4401/4009, reconnect catch-up (page-1 + count refetch), silent degradation, id-dedupe, refetch-free cache merges
- `/notifications` feed — server-guarded all-roles route + full client view tree (7-type + read filters, pagination, mark-one/mark-all with pluralized snackbar, skeleton/empty/error surfaces, RTL-logical layout, TEXT-node-only rendering)
- App-bar bell + unread badge (99+ overflow, pluralized aria, `keyFields:false` page type) + per-role sidebar nav entries
- Localized en + ar (dual/plural branches live-proven)

## 2. Test Evidence Index (all deterministic ×2 at close)

| Suite | Count | Location |
|---|---|---|
| DB repository | 28/0/104 | `backend/db/test/logic/notifications/` |
| Engine emit + inbox + chaos | 96/0/1218 | `backend/services/notifications/` (9 files) |
| Transports + degradation | included above | `backend/services/notifications/realtime/` |
| WS sidecar | 25/0/84 | `backend/ws/notification-ws-server.test.ts` |
| GraphQL integration matrix (live-tier) | 23/0/477 | `backend/graphql/test/notification-integration.matrix.test.ts` |
| GraphQL query + mutation (live-tier) | 12/0 + 13/0 | `backend/graphql/test/` |
| SDL static assertions + schema-surface | 15/0 + 27/0 | `backend/graphql/test/` |
| Documents contract | 12/0/59 | `frontend/graphql/sharedDocuments/notifications/` |
| Component tier (feed/badge/hook/chaos/scan) | 100/0 | `test/ui/components/` (9 files) |
| Journeys J1 + J2 (GREEN since 2.7) | 9/0 + 9/0 | `test/workflows/notifications/` |
| Enum parity + namespace parity | 25/0 + 63/0 | `backend/enum/` + `shared/locale/` |
| **Plan-owned total** | **~433 tests / 0 failures** | canonical runner, KOTTABY guard honored |

Per-task evidence: `outcome/<task>-outcome.md` (29 docs) + `outcome/review-waves/` (20 reports) + `outcome/screenshots-4.{2,3,4}/` (18 PNGs).

## 3. Quality Gates (final bundle — all PASS)

- `bun tsgo` 0 errors · `bun biome:check` 579 files exit 0 · `bun run lint` 0 errors (plain full-repo)
- Schema/migration drift vs origin/main: EMPTY · allowlist byte-unchanged · codegen regeneration byte-identical
- 7/7 suites green across two consecutive runs · DB residue zero · seed idempotent-green (admin count 1→1)
- CI pickup verified (no topology restructure; package.json delta = 1 ws script line; zero lockfile changes)

## 4. Review Waves (Phase 6)

5 rounds × 4 waves (types/backend/frontend/pentester) = **20 independent review executions** (≥ 10 minimum); stop rule satisfied (Rounds 4 + 5 both zero findings). Round 1–3 surfaced 14 actionable findings — **all fixed immediately** (tx-path idempotency receipt store; O(recipients) WS delivery; 4KB frame cap; row a11y; MUI sx numeric reinterpretation; focus-visible rings ×14; shutdown drain-window race; skip-warn hardening) or ruled with owning tickets (D7–D9).

## 5. Deferred Items Handoff (ledger: `deferred-items.md` — all 🔄, zero ❌/⚠️ on entries)

| ID | Item | Owning ticket |
|---|---|---|
| D1 | Per-event emitter wiring (engine emits; domains don't yet) | DEV3-011 / DEV1-016/017 / DEV2-016/017 / DEV3-012/013 / DEV3-022d |
| D2 | Recipient-locale copy storage | future `users.locale` decision |
| D3 | Production WS host provisioning | deployment workstream |
| D4 | Multi-channel / unified preferences | notification-preferences ticket |
| D5 | GraphQL bearer-context governance window (pinned by 5.1 matrix) | future governance-context gate |
| D6 | Coverage ruling (branch% unmeasurable; 4 closable seams enumerated) | future test-hardening pass |
| D7 | Boot-guard plain-Error carve-out | optional ConfigurationError refinement |
| D8 | JWT `sub` coercion defense-in-depth | auth-domain ticket |
| D9 | Deployment posture (NAT throttle, global-cap residual, frame cap) | deployment workstream |

## 6. Consumer-Ticket Guidance

Canonical consumption guide: **`docs/notifications/realtime-engine.md`** (§3.2 code sketch + per-ticket table). Rules: import engine contracts only; NEVER write `notifications` rows directly; honor publish-after-commit (emit in tx → `publishReceipts` post-commit); localized copy is the emitter's responsibility; mark-read is NOT a realtime event.

Decisions addenda: `docs/specs/open-decisions-and-gaps.md` A.4.1–A.4.3 (sidecar topology; fail-open vs fail-closed idempotency; localization-at-emitter).

## 7. Close-Out Notes

- Tasks 6.1/6.2/7.1–7.3 outcome evidence lives in `outcome/review-waves/`, gate commits `79baf2d`/`a0f6612`, and commit `6a33808` (deliverables verified on disk by the 7.4 bundle) — recorded here per the final-gate criterion.
- Environment learnings for future plans (surgical dispatch pattern, branch-watchdog protocol, user-space Redis provisioning) are recorded in `worklog.md` entries `0-env-stability` / `0-redis-provisioning` and the 5.2 ledger D-1.
- Demo topology (this sandbox): PostgreSQL :5432 + Redis :6379 + dev server :3000 + `WS_HOST=localhost bun run ws` sidecar :3001 — browse `http://localhost:3000`.
