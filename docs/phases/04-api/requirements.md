# Phase 4 — API

> **Status:** Complete — commit `6bf5345` (`feat: add /api/analyze, /api/dataset, /health with validation, error envelope, throttling, and JSON logging`).

Local contract for Phase 4. Companion to the authoritative roadmap in `docs/03-implementation-plan.md`; this document is the per-phase scope agreement.

## Goal

Wire the algorithm and repository through HTTP. Three endpoints, validated input, structured error envelope, request-scoped JSON logging, per-IP throttling, and float-to-two-decimals rounding only at the response boundary.

## Deliverables

1. **`AnalyzeDto`** (class-validator + class-transformer) — `from`/`to` ISO 8601 UTC, second-precision, both required.
2. **Three controllers**:
   - `GET /api/dataset` — returns dataset metadata.
   - `GET /api/analyze?from=&to=` — returns the optimal buy/sell pair (or `null`s) plus the `window` echo.
   - `GET /health` — returns `{ status: 'ok' }`. Outside the `/api` prefix; throttler-exempt.
3. **Global API prefix `/api`** with `/health` excluded.
4. **Global `ValidationPipe`** (`whitelist`, `forbidNonWhitelisted`, `transform: true`).
5. **`AllExceptionsFilter`** mapping domain errors and validation failures to `{ statusCode, error, message, code }`.
6. **Response mapper** rounding prices and `profitPerShare` via `Math.round(x * 100) / 100` at the boundary.
7. **`nestjs-pino`** logger — JSON everywhere (no `pino-pretty` transport in dev), request-scoped, auto-tagging `reqId`/`method`/`path`/`status`.
8. **`@nestjs/throttler`** — 60/min on `/api/analyze`, 120/min on `/api/dataset`, `@SkipThrottle()` on `/health`.
9. **Integration test suite** via `Test.createTestingModule`.

## API contract (reaffirming the brief)

### `GET /api/dataset` → `200`

```json
{
  "symbol": "ACME",
  "name": "Acme Corporation",
  "currency": "USD",
  "from": "2026-04-22T09:30:00Z",
  "to": "2026-04-22T16:00:00Z",
  "intervalSeconds": 1
}
```

### `GET /api/analyze?from&to` → `200` (profitable window)

```json
{
  "window": { "from": "2026-04-22T10:00:00Z", "to": "2026-04-22T14:00:00Z" },
  "buy": { "time": "...", "price": 142.17 },
  "sell": { "time": "...", "price": 158.94 },
  "profitPerShare": 16.77
}
```

### `GET /api/analyze?from&to` → `200` (no profitable trade)

`buy`, `sell`, and `profitPerShare` are all `null`. The `window` echo is preserved.

### `GET /health` → `200`

```json
{ "status": "ok" }
```

### Error envelope

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "...",
  "code": "INVALID_RANGE"
}
```

| Condition                              | Status | `code`              |
| -------------------------------------- | ------ | ------------------- |
| Missing or malformed `from`/`to`       | 400    | `INVALID_TIMESTAMP` |
| Sub-second precision in `from` or `to` | 400    | `INVALID_TIMESTAMP` |
| `from >= to`                           | 400    | `INVALID_RANGE`     |
| Window outside the dataset             | 400    | `OUT_OF_BOUNDS`     |
| Data integrity issue at runtime        | 500    | `DATA_UNAVAILABLE`  |
| Anything else                          | 500    | `INTERNAL_ERROR`    |

## DTO and validation

`AnalyzeDto` uses class-validator decorators. `from` and `to` are strings (we don't auto-transform to `Date` in the DTO; the controller parses them after validation, so the DTO holds raw strings and the controller produces `Date` objects). Sub-second precision is rejected via a regex refinement: only `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` matches.

Global `ValidationPipe` is configured with `whitelist: true` (strip unknown fields), `forbidNonWhitelisted: true` (reject requests with unknown query params), and `transform: true` (instantiate the DTO class).

## Exception filter

`AllExceptionsFilter` (a NestJS `ExceptionFilter` registered globally in `main.ts`) maps:

- Class-validator `BadRequestException` from `ValidationPipe` → 400 `INVALID_TIMESTAMP` (the only validation rule we have on this DTO is the timestamp regex; if other rules are added later, this mapping needs revisiting).
- Custom `InvalidRangeError` thrown by the controller when `from >= to` → 400 `INVALID_RANGE`.
- The repository's existing `OutOfBoundsError` → 400 `OUT_OF_BOUNDS`.
- A custom `DataUnavailableError` (defensive — boot integrity check should catch corruption first) → 500 `DATA_UNAVAILABLE`.
- Everything else → 500 `INTERNAL_ERROR`. The client receives the generic message; the actual error is logged with stack trace.

The filter does **not** leak stack traces or internal field names to the response.

## Response rounding

`Math.round(x * 100) / 100` at the controller boundary. Never `toFixed(2)` (returns a string, breaks the JSON `number` contract). The repository hands out raw float prices; the algorithm computes profits at full precision; the controller rounds only when constructing the response object.

## Logging

`nestjs-pino` with `LoggerModule.forRoot({ pinoHttp: { level, autoLogging: true } })`. **JSON output everywhere** — no `pino-pretty` transport in dev or prod (dev/prod parity over local readability). The HTTP middleware auto-tags every log line with `reqId`, `method`, `path`, `status`. No custom serialisers, no redaction rules.

## Throttling

`@nestjs/throttler` with two named throttlers configured at the module level:

- `analyze`: 60 requests per minute.
- `dataset`: 120 requests per minute.
- `/health` uses `@SkipThrottle()` so Railway's health probe and similar orchestrator hits aren't counted.

Per-IP by default. Returns 429 with `Retry-After` header on breach.

## In scope

- HTTP wiring for the three endpoints listed above.
- DTO + global `ValidationPipe`.
- Global `AllExceptionsFilter` mapping domain errors and validation failures to the envelope.
- Response rounding at the controller boundary.
- `nestjs-pino` logger (JSON everywhere).
- `@nestjs/throttler` with the per-route limits above.
- Integration tests covering happy paths, every error code, the `/health` carve-out, and the throttler.

## Out of scope (deferred to later phases)

- Static frontend, Helmet, CSP — Phase 5.
- Same-origin serving — Phase 5.
- Frontend whole-share funds calculation — Phase 5.
- Railway deployment — Phase 6.
- README, Postman collection — Phase 7.

## TDD scope

Per CLAUDE.md:

- **Test-after** for everything in this phase (controllers, DTOs, exception filter wiring, response mapper). The brief and CLAUDE.md both state TDD applies only to `src/analysis/*` and `src/data/*`.
- Integration tests go in colocated `*.spec.ts` files (or a single `app.spec.ts` in the controllers area) using `Test.createTestingModule` rather than the existing `test/` e2e config.

## Out of test scope

Tests validate our code's contract, not third-party behaviour or internal state. The following are explicitly **not** tested in Phase 4:

- **NestJS framework correctness.** That `ValidationPipe` validates, that `ExceptionFilter` runs on exceptions, that `Throttler` counts requests — assumed to work. We test our **wiring** (the right pipe is installed, the filter produces the envelope shape we want, the throttler is configured with our limits).
- **`class-validator` and `class-transformer` correctness.** Their decorators are assumed to work; we test that our DTO declares the right rules.
- **`pino` correctness.** We don't assert on the format of log lines, only that the logger module is wired.
- **Repository internals.** Already covered in Phase 2.
- **Algorithm correctness.** Already covered in Phase 3.
- **Static frontend, Helmet, CSP, Railway deployment.** Out of scope.
- **Performance.** The complexity assertion lives at the algorithm layer (Phase 3). The HTTP layer doesn't repeat it.
- **Throttler accuracy beyond "rejects after limit."** We don't test that it counts to exactly 60 requests; we test that hammering past the limit yields 429.

## Required tests

Driven by the **F0 self-review** lens — each test must answer "what bug if it fails?" and "which code path does it exercise?" with a unique answer to the latter.

### Happy paths

- `GET /api/dataset` returns the metadata shape and matches the loaded dataset (symbol, name, currency, from, to, intervalSeconds).
- `GET /api/analyze` with a profitable window returns the buy/sell pair with prices rounded to two decimals, the `window` echo, and a numeric `profitPerShare`.
- `GET /api/analyze` with a flat window returns `buy`, `sell`, `profitPerShare` all `null` (200, not an error).
- `GET /health` returns `200 { status: 'ok' }` at the unprefixed path.

### Error paths (one per error code)

- `INVALID_TIMESTAMP` — sub-second precision, missing `from`, malformed string.
- `INVALID_RANGE` — `from >= to`.
- `OUT_OF_BOUNDS` — `from` before dataset start or `to` after dataset end.
- `DATA_UNAVAILABLE` — exercised by mocking the repository to throw a `DataUnavailableError` (defensive code path; we don't trigger it via real data).
- `INTERNAL_ERROR` — exercised by mocking the repository to throw an unexpected `Error` and asserting the response is the generic envelope, not a stack trace.

### Throttler

- After 60 successful `/api/analyze` requests in one window, the 61st returns 429 with `Retry-After`. (Run with reduced limits in the test module to keep the test fast — see tasks.md.)
- `/health` is exempt: spam it past any throttler limit and it still returns 200.

### Wiring sanity

- Global API prefix is applied (`GET /dataset` without `/api` returns 404).
- `/health` is reachable at the unprefixed path (`GET /api/health` returns 404; `GET /health` returns 200).

## Success criteria

- `npm run lint` clean; `npm run typecheck` clean; `npm test` all green; `npm run build` clean; `npm audit --audit-level=high` clean.
- Every endpoint contract assertion in this document is exercised by at least one test.
- Phase 4 lands as a single atomic commit with the message exactly: `feat: add /api/analyze, /api/dataset, /health with validation, error envelope, throttling, and JSON logging`.
- Phase 2 + Phase 3 doc cleanup (status headers, all-checked tasks) folds into the same commit.

## Dependencies on prior phases

- **Phase 0 (CLAUDE.md):** atomic commits, AAA, no `--no-verify`, no `console.log`.
- **Phase 1 (scaffold):** `@nestjs/config` already validates env including `PORT` and `LOG_LEVEL`. ESLint, Prettier, Husky, CI, audit gate already active.
- **Phase 2 (repository):** `PriceRepository` injected via DataModule. `OutOfBoundsError` is the existing domain error.
- **Phase 3 (algorithm):** `bestTrade(prices)` consumed directly by the analyze controller. No DI wrapping; called as a pure function.

## Risks

- **`/api` prefix vs `/health` carve-out.** Misconfiguring this means `/health` is unreachable or `/api/health` resolves to it. Mitigated by an explicit "wiring sanity" test that hits both paths.
- **`ValidationPipe` error → `INVALID_TIMESTAMP` mapping.** Today's only DTO field is the timestamp; the mapping is safe. If a future field is added with a different validator, the filter must check the failed property name to pick the right code. Documented as a follow-up risk in the filter file's comment, not built now.
- **Throttler in tests.** `@nestjs/throttler` uses real timers by default; tests need either reduced limits per-test or a fake-timer setup. Plan: reduce limits in the test module so 61 requests is a quick loop.
- **Logging in tests.** `nestjs-pino` writes to stdout; this can flood test output. Plan: configure the logger to use `level: 'silent'` in test env, OR pipe to a mute stream.
- **Float artefact in `profitPerShare`.** `158.94 - 142.17 = 16.770000000000003`; the rounding step turns it into `16.77`. We test the rounded boundary value, not the internal float.
