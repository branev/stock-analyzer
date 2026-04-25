# Stock Price Analyzer — Project Brief

## Overview

A sessionless web application that, given a time slice within a known historical period, returns the optimal buy/sell timestamps that would have maximised profit for a single share. The UI layers affordability on top: the user supplies available funds, and the result is expressed as "buy N shares at X, sell at Y, profit = Z."

Single repo, single deployment. NestJS serves both the API and the static frontend. Data is a single committed JSON file representing one ticker (Acme) over a known, uninterrupted period, matching the task specification exactly.

---

## Tech Stack

- **Backend:** NestJS
- **Frontend:** Alpine.js + Pico CSS, served directly by NestJS as static files
- **Data:** Static JSON file committed to the repo, loaded at boot
- **Source control:** GitHub, public repo. Submission shares both the repo URL and the deployed Railway URL.
- **Hosting:** Railway
- **CI/CD:** GitHub Actions — run tests on push, Railway auto-deploys on merge to main

---

## API Contract

### Base URL
Served from the same origin as the frontend. All endpoints are prefixed with `/api`.

### `GET /api/dataset`
Returns metadata about the dataset so the UI can constrain its date pickers.

**Response 200**
```json
{
  "symbol": "ACME",
  "name": "Acme Corporation",
  "currency": "USD",
  "from": "2024-01-02T09:30:00Z",
  "to":   "2024-01-02T16:00:00Z",
  "intervalSeconds": 1
}
```

### `GET /api/analyze`
The core endpoint. Returns the most profitable buy/sell pair within the requested window.

**Query params**
- `from` — ISO 8601 UTC timestamp, inclusive. Must fall within the dataset's known period. Accepted at second precision; sub-second precision is rejected as `INVALID_TIMESTAMP`.
- `to` — ISO 8601 UTC timestamp, inclusive. Must be `> from` and within the dataset's known period. Same precision rule as `from`.

All API timestamps are UTC. The UI also displays in UTC; the user's local timezone is not used anywhere.

**Response 200**
```json
{
  "window": {
    "from": "2024-01-02T10:00:00Z",
    "to":   "2024-01-02T14:00:00Z"
  },
  "buy":  { "time": "2024-01-02T10:15:23Z", "price": 142.17 },
  "sell": { "time": "2024-01-02T13:42:07Z", "price": 158.94 },
  "profitPerShare": 16.77
}
```

Flat or decreasing window → `buy`, `sell`, `profitPerShare` all `null`. Not an error, just "no profitable trade."

### Error responses

All errors use a consistent envelope:
```json
{ "statusCode": 400, "error": "Bad Request", "message": "…", "code": "INVALID_RANGE" }
```

| Condition | Status | `code` |
|---|---|---|
| Missing or malformed `from`/`to` | 400 | `INVALID_TIMESTAMP` |
| `from` >= `to` | 400 | `INVALID_RANGE` |
| Requested window falls outside the data's known period | 400 | `OUT_OF_BOUNDS` |
| Data integrity issue at runtime (defensive — see Data Model) | 500 | `DATA_UNAVAILABLE` |
| Unexpected server error | 500 | `INTERNAL_ERROR` |

Validation runs before the algorithm — cheap rejections first. Funds are a UI concern, not an API parameter.

---

## Data Model

### JSON shape

A single committed file representing one ticker over one uninterrupted period. The timestamp of each price is implicit in the array index: `prices[i]` corresponds to `startTime + i × intervalSeconds`.

```json
{
  "symbol": "ACME",
  "name": "Acme Corporation",
  "currency": "USD",
  "startTime": "2024-01-02T09:30:00Z",
  "intervalSeconds": 1,
  "prices": [492.10, 492.11, 492.09, ...]
}
```

A 6.5-hour NYSE/NASDAQ trading session at 1-second resolution is 23,400 points — comfortably small as JSON, loaded once into memory at boot. The generated day contains distinct market-behaviour windows (e.g. trending morning, choppy midday, lunch lull, sell-off into close) so running different date ranges produces qualitatively different optimal trades. Exact window boundaries are specified when the mock data is generated. This is useful both for demonstrating the algorithm across conditions and for picking interesting ranges during a live demo.

The mock data covers a single trading session dated within the past two weeks of Claude Code's generation. The date is hard-coded at generation time and committed to the repo. Prices are rounded to two decimals — the conventional tick size for US equities (see analysis doc for the full rationale).

### Integrity check on boot

The data layer verifies on startup that the file exists, is parseable, has a positive `intervalSeconds`, and contains a non-empty `prices` array. Any failure exits the process with exit code 1 and a specific log message naming the file path and the problem.

`DATA_UNAVAILABLE` (500) in the error table is defensive — the boot-time integrity check should catch malformed or missing data in normal operation. Retained explicitly so the API contract documents what the response looks like if a runtime data issue ever occurs.

Once loaded, the data is read-only in memory for the lifetime of the process. No locking is required on the read path; analysis is concurrency-safe by definition.

### Service interface

A single abstraction the rest of the code depends on:

- `getDataset()` → `{ symbol, name, currency, from, to, intervalSeconds }`.
- `getPriceSeries(from, to)` → contiguous slice of prices for the window. Throws a domain error (mapped by the global exception filter to a 400 `OUT_OF_BOUNDS`) if the window extends beyond the dataset. Service code throws; the controller stays free of HTTP-layer concerns.

One implementation: `FilePriceRepository` reads the JSON at boot and keeps it in memory. The interface exists so a future live adapter can be slotted in without changing the analysis service or controller.

---

## Core Algorithm

Classic "best time to buy and sell stock" in a single pass, with the tiebreaker adapted.

**Invariants maintained while scanning left to right:**
- `minPriceSoFar` — lowest price seen, and `minPriceIndex` — where it occurred.
- `bestBuyIndex`, `bestSellIndex`, `bestProfit` — current best trade.

**At each index `i`:**
1. Compute `profit = prices[i] - minPriceSoFar`.
2. If `profit > bestProfit`: record this as the new best (`bestBuyIndex = minPriceIndex`, `bestSellIndex = i`).
3. If `profit == bestProfit` and there's already a candidate: apply the tiebreaker (below).
4. If `prices[i] < minPriceSoFar`: update `minPriceSoFar` and `minPriceIndex`.

### Tiebreaker — "earliest and shortest"

The spec says when multiple trades have equal profit, return the one that is earliest and shortest. Interpret earliest as primary (earliest buy time wins) and shortest as secondary (if buy times also tie, shortest holding period wins — i.e. earliest sell).

**Worked example.** Prices `[5, 6, 5, 6]`. Maximum profit is 1, achievable two ways: buy at index 0, sell at index 1; or buy at index 2, sell at index 3. The earliest-buy-primary rule selects the first pair (index 0 → index 1).

So on equal profit:
- If the new candidate's buy is earlier than the current best's buy → replace. (Within a single left-to-right pass this branch essentially doesn't fire since `minPriceIndex` only moves forward, but it's stated for completeness.)
- If buy times are equal and the new sell is earlier → replace.
- Otherwise keep the current best.

Because we only update `bestProfit` on strict `>`, and `minPriceIndex` never moves backward, the natural behaviour already gives the earliest buy and the earliest sell for that buy. The tiebreaker is still implemented explicitly — relying on implicit behaviour is the kind of thing that breaks silently when someone refactors.

### Edge cases

- Single-point window → no trade possible, return nulls.
- Monotonically non-increasing window → `bestProfit` stays at 0, return nulls. Zero profit is not a trade.
- Exact boundary timestamps → inclusive on both ends.

### Complexity

O(n) time, O(1) extra space, where n is the number of price ticks in the window. Each tick is visited exactly once.

### Output rounding

`profitPerShare`, `buy.price`, and `sell.price` are rounded to two decimals at the API boundary. Use `Math.round(x * 100) / 100` to preserve the JSON number type — not `toFixed(2)`, which returns a string and would silently change the response contract. Internal float arithmetic is full-precision; rounding happens only on response serialisation so raw IEEE 754 artifacts (e.g. `158.94 - 142.17 = 16.770000000000003`) don't leak to clients.

---

## UI

### Screen

A single page. No routing, no session, no auth.

Top to bottom:
1. **Header** — ticker name and coverage period ("ACME — Jan 2, 2024, 09:30–16:00 UTC").
2. **Time range pickers** — `from` and `to` rendered as `<input type="datetime-local">` (HTML5 minute-precision picker), constrained to the dataset's coverage window. Both start empty on first load.
3. **Available funds** — a number input. Optional; if empty, the result omits share count and total profit.
4. **Analyze button** — disabled until both `from` and `to` are populated and valid (within range, `from` < `to`). Also disabled while a request is in flight.
5. **Result area** — empty initially. After a successful query, shows a human-readable sentence plus the raw numbers.

### User flow

1. Page loads → fetch `/api/dataset` → populate header. Set the `min` and `max` attributes on the date pickers based on the dataset's coverage window. Leave the `value` empty so the user must pick a range.
2. User picks `from` and `to`. The Analyze button enables when both are set and valid. User optionally enters funds, clicks Analyze.
3. Frontend submits at minute boundaries (e.g. `2024-01-02T10:15:00Z`); the API accepts second precision but minute granularity is what the picker offers. Frontend validates locally (from < to, both within range, funds ≥ 0 if provided), then calls `/api/analyze?from=…&to=…`.
4. On success: render something like
   > Buy **70 shares** on **Jan 2, 2024 at 10:15:23 UTC** at **$142.17**, sell on **Jan 2, 2024 at 13:42:07 UTC** at **$158.94**. Profit: **$1,173.90** (from $10,000).

   If no funds entered, drop the share-count sentence and show profit-per-share instead. If the API returns nulls, render "No profitable trade found in this window."

   A collapsible **Show math** affordance below the result reveals the full calculation (funds, shares affordable via `floor(funds / buyPrice)`, per-share profit, total profit, return on capital). Collapsed by default so the main result stays primary. Client-side only — no backend change.
5. On error: show the server's `message` inline near the button. No toasts, no modals.

### Optional — price chart

If time permits, render a small price chart of the selected window in the result area with the buy and sell points marked. Small Chart.js embed or hand-rolled SVG. Independent of the "Show math" toggle; both are "makes the result richer" additions.

### Look and feel

Pico CSS's default semantic styling — no custom theme needed. Alpine handles the small amount of reactive state (date bounds, loading flag, result). The frontend is intentionally minimal — no build step, just HTML plus a small Alpine.js script.

### Share calculation

`sharesBought = floor(availableFunds / buyPrice)`, `totalProfit = sharesBought * profitPerShare`. Done in the browser — the server doesn't need to know about funds. This also keeps the API clean for future non-UI consumers.

---

## CI/CD Flow

### GitHub Actions

One workflow, runs on every push and PR to `main`:
1. Checkout, setup Node, install dependencies (cached).
2. Lint.
3. Run tests (algorithm unit tests plus a handful of API integration tests via NestJS's testing utilities).
4. Build.

PRs can't be merged if the workflow fails — standard branch protection.

### Railway

Connected to the GitHub repo. On every push to `main`, Railway pulls, builds, and deploys. The committed JSON data file ships with the build automatically — nothing special needed. Environment variables (`PORT`, `NODE_ENV`) are set in the Railway dashboard. The deployed URL goes in the README.

No staging environment for this scope — it's a take-home; main → prod is fine and honest about the setup.

---

## Production-Ready Checklist

Before calling this done:

- **Input validation** on every query param, using NestJS's `ValidationPipe` with DTOs. Reject early, reject loudly.
- **Consistent error envelope** via a global exception filter. No stack traces leak to clients.
- **Structured logging** via NestJS's built-in logger. Each request logged with method, path, status, duration; errors logged with context. JSON format in production so Railway's log viewer can filter it.
- **Tests — coverage** — unit tests for the algorithm covering: typical profitable window, flat window, monotonically decreasing window, single-point window, tied-profit tiebreaker, boundary-inclusive timestamps. Data-layer tests covering: valid slice, window out of bounds, malformed file rejection at boot. Integration tests for the happy-path endpoint and the main error cases. One performance test asserting a full-day analysis (23,400 ticks) completes within a generous bound (e.g. 100ms) — catches accidental O(n²) regressions.
- **Tests — structure** — all tests follow Arrange-Act-Assert. Each test clearly separates setup, execution, and assertions, either visually (blank lines, comments) or via Jest's lifecycle hooks for shared arrangement.
- **Graceful boot** — if the JSON is missing or malformed, fail loudly at startup rather than on first request.
- **Config via environment** — `@nestjs/config` with a schema validation (Joi or Zod) that rejects boot on invalid or missing env vars. No hardcoded paths, ports, or data-file locations. `.env.example` committed, real `.env` gitignored. No direct `dotenv` dependency; `@nestjs/config` handles loading.
- **Security basics** — Helmet middleware (sets defensive HTTP headers), CORS configured (same-origin is fine since frontend is served by the same server), no secrets in the repo.
- **Rate limiting** — `@nestjs/throttler` with per-IP limits: 60 requests/minute on `/api/analyze`, 120 requests/minute on `/api/dataset`, `/health` exempt. Generous enough to be invisible to real users; tight enough to stop runaway scripts and protect Railway's resource budget. Returns 429 with `Retry-After` on breach.
- **Code quality tooling** — ESLint (TypeScript plugin, NestJS conventions), Prettier (auto-format on save and on commit), TypeScript strict mode with `tsc --noEmit` as a standalone check, Husky + lint-staged to run ESLint/Prettier on pre-commit with `tsc --noEmit` as a whole-project check. All configured from Nest's scaffold defaults, tightened to fail on warnings. Never bypass hooks with `--no-verify`.
- **Dependency hygiene** — `.npmrc` with `min-release-age=7d` to block installs of packages less than 7 days old (defends against common supply-chain attack windows where malicious publishes are typically detected within days). Direct dependencies pinned to exact versions in `package.json` so updates are always explicit commits. `npm audit` runs in CI, failing the build on high/critical vulnerabilities. Dependabot enabled with matching `cooldown.default-days: 7` so its update PRs respect the same policy. Security updates bypass the cooldown.
- **Health endpoint** — `GET /health` returning `{ status: "ok" }`. Railway uses this for its health check.
- **API documentation** — a committed Postman collection at `/docs/stock-analyzer.postman_collection.json` organised into folders ("Health," "Metadata," "Happy path," "Errors") with each request named meaningfully and accompanied by a short description of what it demonstrates. Uses a `baseUrl` environment variable so reviewers can switch between local and deployed in one click. Referenced in the README.
- **README** covering: what it is, architecture overview, how to run locally, how tests and CI work, the live deployed URL, the tiebreaker interpretation, how to import and use the Postman collection, and the "next steps" section.
- **Git hygiene** — atomic commits (each commit does one logical thing and leaves the codebase working), meaningful commit messages describing both what and why, no commented-out code, no `console.log` debris.

---

## Future Work (document in README, do not build)

- Live data feed — fetch from Alpha Vantage or a similar provider, persist refreshed data, expose a refresh mechanism. Gap-handling policy (reject, warn and show best, show best of latest uninterrupted period) is a client decision made at that point.
- Multiple ticker support — add a `symbol` path parameter (or request body field if the API grows richer) and a dropdown in the UI.
- WebSocket price feed for real-time append.
- Event-driven sell signals.
- Multi-stock portfolio comparison.
- Authentication layer.
- Per-user / per-API-key rate limiting (the basic per-IP version is in scope; richer policies that require identity tracking are deferred).
- Separate mock and production data files — mock file with controlled fixtures for tests and demo, production file fed from the live source.

---

## Open Flags

- **Tiebreaker interpretation** — "earliest and shortest" is slightly ambiguous. This brief reads it as earliest-buy primary, earliest-sell secondary. A reviewer might read it as shortest-holding-period primary. Acknowledged in the README.
- **Static serving trap** — serving the frontend from NestJS via `ServeStaticModule` is trivial but easy to misconfigure. The static path must resolve correctly in both dev and the Railway build output. Common "works locally, 404s in prod" failure mode.
- **`intervalSeconds` in the algorithm** — read `intervalSeconds` from the data file in all index calculations. Do not hardcode 1. For this task's 1-second resolution the arithmetic gives the same result either way, but the field exists so that different resolutions work without code changes; hardcoding would silently break that.
