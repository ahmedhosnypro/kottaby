# FX Rate Ingestion

Pluggable FX rate provider system that fetches exchange rates from external APIs and stores them in `currency_exchange_rates` for the billing/invoice snapshot path and the currency display conversion path.

## Providers

| Provider | Env | Base | Notes |
|---|---|---|---|
| Open Exchange Rates | `OPENEXCHANGERATES_APP_ID` | USD | Direct USD-hub rates |
| Fixer (APILayer) | `FIXER_API_KEY` | EUR | Normalized to USD hub (EUR→USD → USD→X = EUR→X / EUR→USD) |

Select via `FX_PROVIDER` (`openexchangerates` default). Adapters live under `providers/<name>/` and implement `IFxRateProvider`. The factory (`providers/FxRateProviderFactory.ts`) uses an async lazy singleton with dynamic imports.

## Environment

| Var | Required | Description |
|---|---|---|
| `FX_PROVIDER` | no (default `openexchangerates`) | Which adapter to instantiate |
| `OPENEXCHANGERATES_APP_ID` | when provider=oer | OER app id |
| `FIXER_API_KEY` | when provider=fixer | APILayer access key |
| `CRON_SECRET` | yes in production | Vercel Cron `Authorization: Bearer` secret |

## Cron

`vercel.json` schedules `GET /api/fx/refresh` daily at `0 6 * * *` (06:00 UTC). Vercel auto-injects `Authorization: Bearer ${CRON_SECRET}`. The route (`app/api/fx/refresh/route.ts`) delegates to `FxIngestionService.refreshRates` with `trigger: cron`, `force: false`. `backend/lib/cron-auth.ts` implements R1-R11 (timing-safe compare, GET-only, prod-required secret, no query-string secret, 405/401/500 fail-closed).

## Manual refresh

GraphQL mutation `refreshExchangeRates(force: Boolean)` gated by `billing.refresh_exchange_rates` + `notImpersonating`. Rate-limited to 3/hour/user via `fx-rate-limit.service.ts` (Redis-backed).

## Idempotency & concurrency

- `fx_sync_runs.isRecentSuccess(30)` skips sync if a success finished within 30 min, unless `force: true` (cron never forces).
- `getRunningSyncRun()` rejects concurrent sync.

## Observability

`fx_sync_runs` stores status (`running`/`success`/`partial`/`failed`), pairs written/failed, raw provider JSON (once per sync), error message, trigger type, and timestamps.

## Staleness alert runbook

The invoice read path (`getLatestExchangeRate`) throws if the effective date is older than 24h. Alert when the latest `fx_sync_runs` success is older than 20h so operators have a buffer before the financial path fails. Query:

```sql
SELECT id, status, finished_at, error_message
FROM fx_sync_runs
WHERE status = 'success'
ORDER BY finished_at DESC
LIMIT 1;
```

If `finished_at < NOW() - INTERVAL '20 hours'`, page the on-call operator.

## Tests

- `@live-fx` tag marks provider integration tests that make real API calls. Skip them in default CI runs when `OPENEXCHANGERATES_APP_ID` / `FIXER_API_KEY` are absent.
- Repository tests (`backend/db/test/repo/fx-sync.repository.test.ts`) use `runInRollback`.
- Route tests (`app/api/fx/refresh/route.test.ts`) mock `FxIngestionService` and exercise the R11 security cases.

## DB schema

- `currency_exchange_rates` (existing) — relational rows, one per (from, to, effective_date). Ingestion writes USD↔X pairs for every `CurrencyCode`.
- `fx_sync_runs` (new) — observability table.
