# Stock Price Analyzer — Analysis & Decisions

Companion to the project brief. The brief is "what to build." This document is "why we chose what we chose, and what we considered."

---

## 1. Assumptions behind "production-ready"

The task's only non-functional requirement is "production ready." That phrase is interpreted here as:

- **The system works correctly on the data the spec describes** — static, uninterrupted, known period. No gold-plating for conditions the spec explicitly rules out.
- **If real data were fed in later, the system would still work** — meaning the data layer is swappable and the algorithm doesn't assume anything magical about the source.
- **Errors are handled properly** — validation, structured responses, no stack traces to clients. The task asks for "adequate response in case of erroneous data."
- **Gap handling policy is to reject on gap** — professional financial tooling returns advice only when the data is uninterrupted, or flags the gap clearly. Rather than build partial coverage handling for a task that promises no gaps, we commit to: if the data ever contains a gap, return a 500 `DATA_UNAVAILABLE`. One error code, minimal surface, still honest. The richer gap-handling policy decision (reject vs. warn-and-show-best vs. show-best-of-uninterrupted-tail) is deferred to the client at the point live data is added.

This framing keeps the scope aligned with the spec while leaving the door open for real-world evolution. The analysis service operates on contiguous arrays. The data layer is responsible for ensuring what it hands over is contiguous.

---

## 2. Tech stack rationale

**Alpine.js + Pico CSS over React/Vite.** Zero build step, sub-100 lines of JS, no second deployment to manage. Pico gives clean default styling without class-name gymnastics. The reviewer sees a working product, not a toolchain. React would have been more impressive if polished but adds complexity disproportionate to the task's scope.

**NestJS serves the frontend directly.** One repo, one deploy, same-origin (no CORS). The trade-off is that `ServeStaticModule` path resolution between dev and Railway build output is a known "works locally, 404s in prod" trap — mitigated by testing the deployed build explicitly.

**Railway over Render.** Simpler setup, GitHub auto-deploy on merge, adequate for this scope. No staging environment by design — for a take-home, main → prod is honest about the setup.

---

## 3. Data storage rationale & limits

JSON in the repo is the right call for this task — inspectable with `cat`, loads in milliseconds, no database to provision. Over-engineering storage for a take-home would signal poor judgment of proportionality.

It stops being the right call at these breakpoints:

| Data volume | Symptom | Replace with |
|---|---|---|
| < 50 MB on disk | None | Stick with JSON |
| 50–500 MB | Sluggish boot, memory pressure | MessagePack, Protobuf, per-symbol files lazily loaded |
| 500 MB – few GB | Parse takes seconds, OOM risk | Parquet + lazy loading, or SQLite/DuckDB |
| > few GB | Won't fit in RAM | TimescaleDB, QuestDB, InfluxDB, ClickHouse |

**Signals it's time to switch, regardless of size:** boot time > 10s, memory > 50% of container limit, cross-symbol queries needed, data is no longer static (live appends).

---

## 4. Data shape — single flat array

Given the spec's "static, uninterrupted, known period" constraints, the data fits a single flat array per ticker with an implicit `startTime + i × intervalSeconds` timestamping scheme. Each price point is 8 bytes plus array overhead; nothing else to store.

This is cleaner than a session-based shape for this task. The moment real data with gaps is introduced, the shape would evolve — either splitting into multiple uninterrupted intervals, or adopting explicit `[timestamp, price]` pairs. Either evolution preserves the O(n) complexity of the algorithm: gaps don't contribute to n, and a per-interval sweep followed by a k-way comparison is still linear in total covered ticks. The cut between today's single-array shape and tomorrow's multi-interval shape is clean.

---

## 5. Single ticker, not multi-ticker

The spec describes "the price history of **a share**" — singular. Nothing in the spec requires supporting multiple tickers. The initial draft of this brief assumed multi-ticker with a dropdown; re-reading the PDF showed that assumption wasn't grounded in the task.

Single-ticker means:
- API path is `/api/analyze` — no symbol parameter.
- UI has a static header, no dropdown.
- Data file represents one ticker.

If a future version wants multiple tickers, the clean addition is a `symbol` path parameter (e.g. `/api/stocks/:symbol/analyze`) or a request body field if the API grows richer. Both are additive changes, not breaking ones.

---

## 6. API shape decisions

**GET, not POST, for `/analyze`.** It's a pure read — no state changes, semantically idempotent, safe to retry. Inputs are small and URL-safe (two timestamps). Query-string parameters make the request shareable and debuggable — paste into a browser, curl it. POST is reserved for mutations; GET is the correct REST shape for search/analyze endpoints that return a computed result.

**Funds live in the UI, not the API.** Keeps the API clean for future non-UI consumers; the server has no business knowing about the user's wallet. The share-count calculation is trivial client-side arithmetic.

**`profitPerShare` is server-computed.** Establishes the server as the source of truth for derived values. Future additions (percentage return, annualised yield) go server-side for the same reason — clients shouldn't duplicate business logic. The UI just displays; the backend does the math.

**One error code for data integrity (`DATA_UNAVAILABLE`) rather than a family of gap-specific codes.** The spec describes uninterrupted data, so any file-level integrity failure is by definition unexpected. One error code, one message, one handling path. Fewer branches, less surface for bugs.

**No `warnings` array in the response.** Removed as premature abstraction. Adding it later if live data is introduced is an additive change; shipping an always-empty array today would be noise.

**Two-decimal precision for prices and profit.** US equity prices conventionally tick at $0.01 — two decimal places. Sub-penny pricing exists in the wider market (some ETFs under $1, most options) but isn't relevant at the price range we're modelling, and we don't build for those edge cases. Generated mock prices and computed `profitPerShare` are rounded to two decimals at the API boundary. Internal arithmetic stays full-precision to avoid accumulating rounding error during the algorithm; rounding happens only on response serialisation so IEEE 754 artifacts (`158.94 - 142.17 = 16.770000000000003`) don't leak to clients.

**Basic per-IP rate limiting, no authentication.** The spec is explicitly sessionless and asks for "production-ready," not "secured." Adding auth would be scope expansion. But a publicly-deployed API benefits from a minimum guardrail against runaway scripts that could exhaust Railway's resource budget. `@nestjs/throttler` provides this in one decorator: 60 requests/minute on `/api/analyze`, 120/minute on `/api/dataset`, `/health` exempt for orchestrator probes. Limits are deliberately generous — invisible to real users, tight enough to stop abuse. Per-IP is the right granularity given there's no caller identity to bind to. Richer policies (per-user, per-API-key, sliding-window or token-bucket algorithms, distributed rate limiting via Redis) are listed as future work; they require identity tracking that isn't part of this scope.

---

## 7. Algorithm decisions

**Tiebreaker interpretation.** "Earliest and shortest" is read as earliest-buy-primary, earliest-sell-secondary. The spec wording is slightly ambiguous — a reviewer might read it as shortest-holding-period-primary. The README will acknowledge the chosen reading.

**Explicit tiebreaker code, even though the single-pass naturally produces the right answer.** `minPriceIndex` only moves forward, so the natural behaviour already gives the earliest buy and the earliest sell for that buy. But relying on emergent behaviour breaks silently under refactor. The cost of writing the tiebreaker out explicitly is negligible; the cost of debugging a silent regression isn't.

**Complexity.** O(n) time, O(1) extra space, where n is ticks in the window. Each tick is visited exactly once. Future gap-handling variants (per-interval sweeps with a final compare) preserve O(n) — gaps reduce n rather than multiplying it.

**Built test-first.** The algorithm and data layer were developed using TDD — write a failing test, write the minimum code to pass it, refactor while keeping tests green. The single-pass-with-running-minimum shape emerged from the refactor step after each green, not from designing it up-front. Boilerplate (controllers, DTOs, framework wiring) was tested after. TDD pays off most on pure-logic code where edge cases drive the design; less so on framework glue.

---

## 8. Things deliberately not built

- **Live data feed.** The spec says the data is static. Building a live adapter would be scope creep.
- **Multiple ticker support.** Scoped to future work.
- **Session / gap handling.** The spec promises uninterrupted data; handling gaps that can't occur is over-engineering.
- **Mock/live toggle.** There is no "mock mode" when there's only one data mode. The data is the data.
- **Staging environment.** Out of scope for a take-home.
- **Top-K trades.** API returns the single best pair. Extending to multiple candidates is a future feature.

---

## 9. Future work (mirrored from README)

- **Live data feed.** Candidates: Alpha Vantage (free tier supports intraday at minute resolution, `outputsize=full` for extended history), Polygon (paid for 1-second resolution), Twelve Data. All can be normalised into the same JSON shape with minimal adapter work. When this happens, the client decides gap-handling policy explicitly: reject on any gap, warn and show best of covered periods, or show best of the most recent uninterrupted stretch.
- **Persistence.** For a production deployment, ticker data should persist across redeploys (Railway volume or external storage), with a separate mock fixture file for tests and demos. Keeping the two files separate means the test suite has controlled, deterministic inputs regardless of what production is ingesting.
- **Multiple tickers.** Adds `symbol` path parameter and a UI dropdown. Non-breaking for the existing single-ticker path if versioned carefully.
- **WebSocket feed** for real-time append.
- **Event-driven sell signals.**
- **Multi-stock portfolio comparison.**
- **Authentication layer.**
- **Per-user / per-API-key rate limiting** — basic per-IP version is in scope; richer policies that require identity tracking are deferred.

---

## 10. Known risks & open flags

- **Tiebreaker interpretation ambiguity** — flagged in README.
- **`ServeStaticModule` path resolution** between dev and Railway build output — easy to misconfigure, verify on deployed build.
- **`intervalSeconds` is a real field, not a constant** — the data layer must use the value from the file, not assume 1. For this task it is 1, but the code should not hardcode it.
