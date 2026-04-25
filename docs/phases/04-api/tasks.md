# Phase 4 — Tasks

Sequential execution checklist. Work top-to-bottom. Do not skip ahead. Each task should leave the working tree in a state where lint, typecheck, and test still pass.

Conventions:

- `[ ]` pending, `[x]` done.
- This phase is **test-after** per CLAUDE.md. Build the wiring first; integration tests come at the end of Section H.
- Each task is small enough that a junior engineer could pick it up without further context.

---

## Section A — Dependencies

- [x] **A1.** Install with `--save-exact`:
  - Runtime: `class-validator`, `class-transformer`, `@nestjs/throttler`, `nestjs-pino`, `pino`, `pino-http`.
  - No `pino-pretty`. We're using JSON output everywhere.
- [x] **A2.** Confirm `package.json` lists all six new packages with exact (no caret) versions. Run `npm audit --audit-level=high` and confirm 0 vulnerabilities.

---

## Section B — DTO + global ValidationPipe

- [x] **B1.** Create `src/api/dto/analyze.dto.ts`. Export `AnalyzeDto` with two `string` properties: `from`, `to`. Decorate each with `@IsString()`, `@IsNotEmpty()`, `@Matches(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)` to enforce ISO 8601 UTC second-precision (sub-second rejected).
- [x] **B2.** Wire global `ValidationPipe` in `src/main.ts` with `{ whitelist: true, forbidNonWhitelisted: true, transform: true }`. Keep the existing `ConfigService.get('PORT')` and bootstrap-catch logic intact.

---

## Section C — Exception filter + domain errors

- [x] **C1.** Create `src/api/errors.ts` with two domain error classes: `InvalidRangeError` (thrown when `from >= to`) and `DataUnavailableError` (defensive, for runtime data corruption). Both extend `Error` with a name property.
- [x] **C2.** Create `src/api/exception-filter.ts` exporting `AllExceptionsFilter`, a NestJS `@Catch()` filter that maps:
  - `BadRequestException` (from `ValidationPipe`) → 400 `INVALID_TIMESTAMP`.
  - `InvalidRangeError` → 400 `INVALID_RANGE`.
  - `OutOfBoundsError` (imported from `src/data/price.repository.ts`) → 400 `OUT_OF_BOUNDS`.
  - `DataUnavailableError` → 500 `DATA_UNAVAILABLE`.
  - Anything else → 500 `INTERNAL_ERROR`. Log the original error (stack + message) at error level; the response stays generic.

  Response shape exactly: `{ statusCode, error, message, code }`. No stack traces, no internal field names.

- [x] **C3.** Register the filter globally in `src/main.ts` via `app.useGlobalFilters(new AllExceptionsFilter())`.

---

## Section D — Controllers

- [x] **D1.** Create `src/api/dataset.controller.ts`. `@Controller('dataset')`, single `@Get()` returning the dataset metadata from `PriceRepository.getDataset()`. Apply `@Throttle({ dataset: { limit: 120, ttl: 60_000 } })`.
- [x] **D2.** Create `src/api/analyze.controller.ts`. `@Controller('analyze')`, single `@Get()` accepting `@Query() AnalyzeDto`. Steps:
  1. Parse `from`/`to` strings into `Date` objects.
  2. If `from >= to`, throw `InvalidRangeError`.
  3. Call `repo.getPriceSeries(fromDate, toDate)`.
  4. Call `bestTrade(prices)` from `src/analysis/best-trade.ts`.
  5. Construct response: `{ window: { from, to }, buy, sell, profitPerShare }`. Use the response mapper (Section E) for prices.
  6. Apply `@Throttle({ analyze: { limit: 60, ttl: 60_000 } })`.
- [x] **D3.** Create `src/api/health.controller.ts`. `@Controller('health')`, `@SkipThrottle()`, single `@Get()` returning `{ status: 'ok' }`.
- [x] **D4.** Set the global API prefix to `/api` in `src/main.ts` via `app.setGlobalPrefix('api', { exclude: ['/health'] })`. This is the carve-out so `/health` stays at the root path.
- [x] **D5.** Wire all three controllers into `AppModule` (or a sub `ApiModule` if it grows past three — judgement call; default to `AppModule` per the no-anticipation rule).

---

## Section E — Response mapper

- [x] **E1.** Create `src/api/response-mapper.ts` with two pure helpers:
  - `roundCurrency(x: number): number` returning `Math.round(x * 100) / 100`. Never `toFixed`.
  - `mapAnalyzeResponse(dataset, window, prices, trade): AnalyzeResponse` constructing the response object: `{ window: {from, to}, buy, sell, profitPerShare }`. Maps `BestTrade | null` to the buy/sell/profit triple (or three nulls). Computes `buy.time` and `sell.time` from indices via `dataset.startTime + i * dataset.intervalSeconds`. Rounds `buy.price`, `sell.price`, `profitPerShare`.
- [x] **E2.** `AnalyzeController` calls `mapAnalyzeResponse` instead of constructing the object inline.

---

## Section F — Logger (nestjs-pino, JSON everywhere)

- [x] **F1.** Add `LoggerModule.forRoot()` to `AppModule.imports` with the JSON-only configuration:

  ```ts
  LoggerModule.forRoot({
    pinoHttp: {
      level: process.env.LOG_LEVEL ?? 'info',
      autoLogging: true,
      // No transport, no pino-pretty. JSON output in dev and prod (parity).
    },
  });
  ```

- [x] **F2.** Replace the bootstrap `Logger.error` call in `src/main.ts` with the pino logger. Use `app.useLogger(app.get(Logger))` so NestJS's internal logger uses pino.
- [x] **F3.** In the test environment, set `LOG_LEVEL=silent` (via the test module's `ConfigService` override or a Jest `setupFiles` env injection) so pino doesn't flood test output.

---

## Section G — Throttler

- [x] **G1.** Add `ThrottlerModule.forRoot([...])` to `AppModule.imports` with two named throttlers:

  ```ts
  ThrottlerModule.forRoot([
    { name: 'analyze', limit: 60, ttl: 60_000 },
    { name: 'dataset', limit: 120, ttl: 60_000 },
  ]);
  ```

- [x] **G2.** Add `APP_GUARD` provider for `ThrottlerGuard` so the throttler is global by default.
- [x] **G3.** Confirm `@SkipThrottle()` on `HealthController` and the named `@Throttle()` decorators on the analyze and dataset controllers (Section D).

---

## Section H — Integration tests

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

Use `Test.createTestingModule` with `AppModule` for the happy paths, error paths, and wiring sanity. For the throttler test, override `ThrottlerModule` with reduced limits so the loop is fast.

- [x] **H1.** Create `src/api/api.spec.ts` (single integration spec covering all endpoints).
- [x] **H2.** Happy path: `GET /api/dataset` returns `{ symbol: 'ACME', ... }` matching the committed dataset. Status 200.
- [x] **H3.** Happy path: `GET /api/analyze?from=2026-04-22T09:30:00Z&to=2026-04-22T16:00:00Z` returns the full-day buy/sell pair with `profitPerShare` rounded. Spot-check against Phase 2's variety verification (buy `2026-04-22T09:30:13Z` $107.89, sell `2026-04-22T11:39:22Z` $129.43, profit ≈ $21.54). Assert prices and profit are `number`s with at most two decimal places.
- [x] **H4.** Happy path: a flat sub-window returns `buy`, `sell`, `profitPerShare` all `null` with status 200. Use the lunch-lull window from Phase 2's variety verification (or any small window known to produce a non-null tiny trade — adjust if needed).
- [x] **H5.** `INVALID_TIMESTAMP`: `GET /api/analyze?from=2026-04-22T09:30:00.500Z&to=...` (sub-second). Asserts 400 + envelope `code: 'INVALID_TIMESTAMP'`.
- [x] **H6.** `INVALID_TIMESTAMP`: missing `from`. Asserts 400 + envelope.
- [x] **H7.** `INVALID_TIMESTAMP`: malformed `from` (`'not-a-date'`). Asserts 400 + envelope.
- [x] **H8.** `INVALID_RANGE`: `from === to`. Asserts 400 + envelope `code: 'INVALID_RANGE'`.
- [x] **H9.** `INVALID_RANGE`: `from > to`. Asserts 400 + envelope.
- [x] **H10.** `OUT_OF_BOUNDS`: `from` before the dataset's start. Asserts 400 + envelope `code: 'OUT_OF_BOUNDS'`.
- [x] **H11.** `OUT_OF_BOUNDS`: `to` after the dataset's end. Asserts 400 + envelope.
- [x] **H12.** Use the test name `it('maps DataUnavailableError to a 500 envelope with code DATA_UNAVAILABLE', ...)`. The name describes the **exception filter's mapping contract**, not a production scenario (the data layer doesn't fail at runtime under normal operation; we override `PriceRepository` in the test module to throw `DataUnavailableError` purely to exercise the defensive filter path). Asserts 500 + envelope `code: 'DATA_UNAVAILABLE'`.
- [x] **H13.** Use the test name `it('maps an unexpected exception to a 500 envelope with code INTERNAL_ERROR and does not leak the original message or stack trace', ...)`. The name describes the **filter's catch-all mapping contract**. Override `PriceRepository` to throw a generic `Error('boom')`; assert 500 + envelope `code: 'INTERNAL_ERROR'`; assert the response body does NOT contain `'boom'` or any stack trace.
- [x] **H14.** Wiring sanity: `GET /dataset` (no `/api` prefix) returns 404.
- [x] **H15.** Wiring sanity: `GET /api/health` returns 404.
- [x] **H16.** Wiring sanity: `GET /health` returns 200 `{ status: 'ok' }`.
- [x] **H17.** Throttler: in a test module with `analyze` limit overridden to 3, send 4 requests; assert the 4th returns 429 with `Retry-After` header.
- [x] **H18.** Throttler exemption: in the same low-limit test module, hammer `/health` 10 times and confirm all return 200 (no throttling).

---

## Section I — Verify and commit

- [x] **I0.** **Test self-review step.** Walk through every `it(...)` block added in Phase 4. For each, articulate two sentences:
  1. _"If this test fails, what bug in our code has been introduced?"_
  2. _"Which code path does this test actually exercise?"_

  Apply two rules:
  - If the answer to (1) involves a third-party library (class-validator, pino, throttler internals, NestJS's own pipe/filter machinery beyond our wiring), or an implementation detail that doesn't affect the public contract — delete the test.
  - If two tests appear to test different things but exercise the same code path (answer to question 2), one is redundant — keep only the test that traverses the unique path.

  List the articulations and any deletions in the final report at I9.

- [x] **I1.** Run `npm run lint`. Must be clean.
- [x] **I2.** Run `npm run typecheck`. Must be clean.
- [x] **I3.** Run `npm test`. Must be all green. The new spec file `src/api/api.spec.ts` must show in the suite list. Existing Phase 1–3 tests must still pass.
- [x] **I4.** Run `npm run test:e2e`. Must be all green (the existing Phase 1 e2e smoke test still passes through the now-richer module graph).
- [x] **I5.** Run `npm run build`. Must be clean.
- [x] **I6.** Run `npm audit --audit-level=high`. Must report zero vulnerabilities at this level.
- [x] **I7.** `git status` review:
  - Confirm `src/api/` files are present.
  - Confirm Phase 2 + Phase 3 doc cleanup (status headers + all-checked tasks) is staged with this commit, not committed separately.
  - Confirm no stray test/debug files left on disk.
- [ ] **I8.** Stage explicitly (no `git add .`):
  - `src/api/` (all files in the directory).
  - `src/main.ts` (modified for ValidationPipe + global filter + global prefix + carve-out + logger).
  - `src/app.module.ts` (modified for LoggerModule + ThrottlerModule + ApiModule or controller registrations).
  - `package.json` and `package-lock.json` (modified by the new deps).
  - `docs/phases/04-api/requirements.md` and `docs/phases/04-api/tasks.md` (the Phase 4 contract).
  - `docs/phases/02-data-and-repository/requirements.md`, `docs/phases/02-data-and-repository/tasks.md` (cleanup: status header + all-checked tasks).
  - `docs/phases/03-algorithm/requirements.md`, `docs/phases/03-algorithm/tasks.md` (same cleanup).
- [ ] **I9.** Commit with message exactly: `feat: add /api/analyze, /api/dataset, /health with validation, error envelope, throttling, and JSON logging`. Include a body that summarises the three endpoints, the validation rule (ISO 8601 UTC second-precision), the error envelope and code mapping, the response rounding rule (`Math.round(x*100)/100`, never `toFixed`), the logger choice (JSON everywhere), and the throttler limits. Mention the Phase 2/3 doc cleanup folded in.
- [ ] **I10.** Confirm the pre-commit hook ran (lint-staged + typecheck) and the commit landed. Show `git log --oneline -3` and `git status`. Update the Phase 4 status header to `Complete — commit <hash>`. Report the I0 articulations and any deletions.
