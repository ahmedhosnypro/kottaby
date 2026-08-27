# Provider Integration Tests (`test/integration/`)

Live **provider smokes** only — one real API round-trip per external service to confirm the adapter is wired correctly. These tests are **not** service behaviour tests, full app flows, or database-layer integration tests.

## What belongs here

| Category | Path pattern | Example |
|----------|--------------|---------|
| Communication adapters | `communication/*.integration.test.ts` | Resend, Twilio, FCM |
| FX providers | `fx/*.integration.test.ts` | Fixer, OpenExchangeRates |
| Database providers | `db/*.integration.test.ts` | Neon HTTP |
| Cache / Redis providers | `redis/*.integration.test.ts` | Upstash, Redis Cloud, local Redis |
| Meeting adapters | `meeting/*.integration.test.ts` | Zoom, Google Meet, Microsoft Teams |

**Naming:** `*.integration.test.ts` only. One `describe` block per provider adapter, **one `test` per file** (single API call — avoids quota / rate limits).

## What does NOT belong here

| Test type | Correct location |
|-----------|------------------|
| Service unit tests (mocked deps) | `backend/services/**/*.test.ts` — run `bun run test:services` |
| PG repo / logic tests (`runInRollback`) | `backend/db/test/` — run `bun run test:db` |
| GraphQL API tests | `frontend/graphql/test/` |
| UI / E2E | `test/ui/` — see `test/ui/AGENTS.md` |

Never add `*.integration.test.ts` under `backend/services/` or `backend/db/test/` for external SaaS providers.

## Commands

All scripts load **`.env.test`** via `bun --env-file=.env.test`.

```bash
bun run test:integration              # All provider smokes (parallel runner)
bun run test:integration:sequential   # Same files, single bun process (debugging)
bun run test:live-comm                  # communication/ only (preload: live-comm-preload.ts)
bun run test:live-fx                    # fx/ only (preload: live-fx-preload.ts)
```

Subset by path:

```bash
bun --env-file=.env.test test test/integration/redis/ --timeout=120000
```

`test:integration` is **not** part of default CI — suites skip when required env keys are absent.

## Environment

- Secrets and provider URLs live in **`.env.test`** (gitignored). Document new keys in `.env.example` and `environment.d.ts`.
- Optional recipient / device tokens (e.g. `RESEND_TEST_TO_EMAIL`, `TWILIO_VERIFIED_TEST_RECIPIENT`, `FCM_TEST_DEVICE_TOKEN`) are for manual full-path runs only; smokes should prefer **zero-cost paths** (simulator addresses, invalid recipients, invalid tokens) where the provider still returns a real HTTP response.
- Preload scripts in `preload/` fail fast when **no** keys exist for a targeted subset (`test:live-comm`, `test:live-fx`).

## Conventions

### Gating (`describeLiveWhen`)

```typescript
import { describeLiveWhen } from "@/test/integration/helpers/describe-live";

const hasResend = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
const describeLive = describeLiveWhen(hasResend, "ResendEmailAdapter @live-comm");

describeLive("ResendEmailAdapter @live-comm", () => {
  test("send() reaches the live Resend API", async () => { /* one call */ });
});
```

When env keys are missing, the suite is `describe.skip` — not a failure.

### Scope of each smoke

- Instantiate the **adapter directly** (`new ResendEmailAdapter()`, `new FixerAdapter()`, etc.) — not the lazy singleton factory unless the factory is what you are integrating.
- Stub **DB side-effects** (`spyOn(NotificationRepository, …)`) when the adapter writes delivery rows; the smoke validates the **provider** path, not persistence.
- Assert the adapter reached the provider: success with a provider id **or** a structured provider rejection (e.g. Resend 429 quota) with `FAILED` delivery status — not unhandled throws.
- Do **not** test business logic, fan-out, permissions, or multi-step service orchestration here.

### Logging

- **Never** use `console.log` / `console.error` — use `testLogger` from `@/shared/lib/logger/testlogger` when debug output is needed.

### Imports

- Use `@/` path aliases (`@/backend/...`, `@/test/integration/helpers/...`).
- No imports from `@/frontend/**` or `@/app/**`.

## Directory layout

```
test/integration/
  AGENTS.md
  helpers/
    describe-live.ts          # shared describe.skip gating
  preload/
    live-comm-preload.ts      # fail-fast for test:live-comm
    live-fx-preload.ts        # fail-fast for test:live-fx
  communication/              # Resend, Twilio, FCM
  fx/                         # Fixer, OpenExchangeRates
  db/                         # Neon HTTP, etc.
  redis/                      # Upstash, Redis Cloud, local (planned)
  meeting/                    # Meeting provider smokes (Zoom, Google Meet, Microsoft Teams)
```

## Adding a new provider smoke

1. Create `test/integration/<domain>/<provider>.integration.test.ts`.
2. One `test`, one API round-trip, gate with `describeLiveWhen`.
3. Add env vars to `.env.test`, `.env.example`, and `environment.d.ts`.
4. Run per-file verification: `bun run scripts/health/sub-loop.ts <file> --lifecycle lint`.
5. Run `bun run test:integration` locally with keys configured.

## Verification

```bash
bun run scripts/health/sub-loop.ts test/integration/communication/resend.integration.test.ts --lifecycle lint
bun run test:integration
```

Instruction file for integration tests: `.github/instructions/tests.instructions.md` (when present).

## Linting Rules

- See `docs/quality/linting-rules.md` for Oxlint & ESLint/sonarjs fix recipes. NEVER use `oxlint-disable` comments.

