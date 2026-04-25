# Stock Price Analyzer — Implementation Plan

Companion to `01-stock-analyzer-analysis.md` (rationale) and `02-stock-analyzer-brief.md` (what to build). This document is the phased execution roadmap. It is authoritative — it supersedes any earlier draft phasing discussed in conversation.

## Approach

Eight phases, each a single atomic commit boundary. Each phase has explicit acceptance criteria; nothing not required by the current phase is built opportunistically. Lightweight dependency safeguards (`.npmrc min-release-age=7d`, `npm audit` in CI, exact version pinning, Dependabot cooldown) are permanent project policy from Phase 1 onward.

Per-phase requirements docs and task lists are written separately before each phase begins.

---

## Phase 0 — Agent working agreement

**Goal.** Configure Claude Code's working environment so it applies project conventions consistently across sessions.

**Built.**
- `CLAUDE.md` at repo root (~30 lines), durable rules only:
  - Authoritative-docs pointers (analysis, brief)
  - Workflow: TDD for analyzer + repository, test-after elsewhere; atomic commits with what-and-why messages; AAA test structure; never `--no-verify`
  - Code style: strict TypeScript, no `any`, no `console.log`, self-documenting names, comments only for *why*
  - Dependency hygiene: pinned exact versions, respect `min-release-age=7d`
  - One spec-derived safety net: `intervalSeconds` is read from the data file in all index calculations, never hardcoded

**Tested.** N/A — agent infrastructure, not code.

**Commit.** `chore: add CLAUDE.md working agreement`

**Risks/dependencies.** None.

---

## Phase 1 — Project skeleton, tooling, CI

**Goal.** Stand up a NestJS project with all quality guardrails before any feature code is written.

**Built.**
- `nest new` scaffold; tighten `tsconfig` strict; `tsc --noEmit` script
- ESLint (typed) + Prettier configs tightened from scaffold (no-console warn, no-explicit-any error, unused-vars error)
- Husky + lint-staged: pre-commit runs lint-staged + project-wide `tsc --noEmit`
- `.npmrc` with `min-release-age=7d`; all dependencies pinned to exact versions
- `.github/workflows/ci.yml`: install (cached), lint, `tsc --noEmit`, test, build, `npm audit --audit-level=high`
- `.github/dependabot.yml` with `cooldown.default-days: 7`; security updates exempt
- `.env.example` (`PORT`, `NODE_ENV`, `DATA_FILE_PATH=./data/acme.json`, `LOG_LEVEL`); `.gitignore` real `.env`
- `@nestjs/config` with Zod schema; validation rejects boot on invalid env

**Tested.** Smoke test on `AppController` so CI has something green to run; config schema rejects an invalid env (unit test).

**Commit.** `chore: scaffold NestJS project with strict typing, lint, hooks, and CI`

**Risks/dependencies.** Phase 0 complete.

---

## Phase 2 — Mock data + generator + repository

**Goal.** Deterministic synthetic dataset and a swappable repository layer with boot-time integrity check.

**Built.**
- `scripts/generate-mock-data.ts` — seeded RNG with **fixed seed `0xACE`** so regeneration produces byte-identical output. Plausible price scale (~$100–$130). Date hardcoded to a recent weekday (2026-04-22). Four phases stitched end-to-end: trending AM, choppy mid, lunch lull, sell-off into close. Writes `data/acme.json`. Wired as `npm run generate:mock-data`.
- `data/acme.json` — committed output, ticker `ACME` / "Acme Corporation"
- `PriceRepository` interface (`getDataset`, `getPriceSeries`)
- `FilePriceRepository` impl: loads JSON at boot via `OnModuleInit`; runs integrity check covering:
  - File exists and is parseable JSON
  - `intervalSeconds` is a **positive integer** (rejects zero, negative, fractional, non-numeric)
  - `prices` is a non-empty array
  - **Every entry in `prices` is a finite number** (rejects strings, nulls, NaN, Infinity)
  - On any failure: log a specific message naming the file path and the problem, then exit with code 1
- Index↔time helpers using `intervalSeconds` from the file — no `1` literals anywhere
- `OUT_OF_BOUNDS` domain error thrown from `getPriceSeries` when the requested window extends beyond the dataset

**Tested.** Repository unit tests: valid slice round-trips; OOB throws; malformed-file rejection at boot covering missing file, unparseable JSON, missing / zero / negative / non-integer `intervalSeconds`, empty prices array, non-numeric entries inside prices. Generator covered indirectly: assert the committed JSON parses and passes the integrity check.

**Dataset-quality verification (mandatory before commit).** Run the algorithm against 5–6 distinct sub-windows (one per phase, plus full-day, plus one cross-phase) and confirm the optimal trades vary meaningfully — different buy/sell timestamps and meaningfully different profit magnitudes. Captured as a one-off script run; not codified as an automated test. If the windows produce uniform or trivial trades, retune the generator's per-phase parameters and re-run before committing.

**Commit.** `feat: add mock-data generator and file-backed price repository with boot-time integrity check`

**Risks/dependencies.** Phase 1 complete. Risk: generator output looks bland → demo falls flat. Mitigation: the explicit 5–6 sub-window verification step above.

---

## Phase 3 — Algorithm + tiebreaker + brute-force tests + complexity assertion

**Goal.** Pure algorithm module, test-first, validated against a brute-force reference, with the complexity assertion made directly at the algorithm layer.

**Built.**
- `analysis/best-trade.ts` — single-pass with running minimum, explicit tiebreaker (earliest-buy primary, earliest-sell secondary)
- Brute-force `O(n²)` reference co-located in tests only — enumerates all `(i, j)` pairs with `i < j`, applies tiebreaker as a post-step

**Tested.**
- TDD example sequence: empty → single-point → two-point ascending → two-point descending → three-point with peak → flat → monotonically decreasing → boundary-inclusive timestamps
- Hand-crafted tiebreaker cases, each compared against the brute-force reference:
  - `[5, 6, 5, 6]` — equal profit, earliest-buy wins (index 0 → index 1)
  - `[5, 5, 5, 5]` — all equal, return null (zero profit is not a trade)
  - `[5, 6, 6, 5]` — equal profit at multiple sells from the same buy, earliest-sell wins (index 0 → index 1)
- Randomised property test: 100 arrays of length 20 generated from a seeded RNG, integer prices in a small range; assert `expect(optimised(arr)).toEqual(bruteForce(arr))` including tiebreaker indices. Catches cases the author didn't think of.
- **Complexity assertion at the algorithm layer:** full-day input (~23,400 ticks) executes under a generous wall-clock bound (e.g. 100ms) directly against the algorithm function — no HTTP overhead in the measurement. This is where O(n) is asserted; the HTTP layer doesn't repeat it.

**Commit.** `feat: add best-trade algorithm with explicit tiebreaker, brute-force reference, and complexity assertion`

**Risks/dependencies.** Phase 2 complete. Risk: tiebreaker silently right by coincidence. Mitigation: brute-force comparison plus randomised property test together cover the boundary cases an author wouldn't enumerate.

---

## Phase 4 — API endpoints, DTOs, exception filter, logging

**Goal.** Wire the algorithm and repository through HTTP with full validation, error envelope, and structured logging.

**Built.**
- `AnalyzeDto` — `from`/`to` ISO 8601 UTC, second precision (Zod refinement / regex rejects sub-second), both required
- `AnalyzeController` (`GET /api/analyze`), `DatasetController` (`GET /api/dataset`), `HealthController` (`GET /health` — outside the `/api` prefix)
- Global API prefix `/api` with `/health` excluded
- Global `ValidationPipe` (whitelist, forbidNonWhitelisted, transform)
- `AllExceptionsFilter` mapping domain errors and validation failures to `{statusCode, error, message, code}`; codes: `INVALID_TIMESTAMP`, `INVALID_RANGE`, `OUT_OF_BOUNDS`, `DATA_UNAVAILABLE`, `INTERNAL_ERROR`
- `nestjs-pino` wired as **JSON everywhere — no `pino-pretty` transport in dev or prod**. Dev/prod parity over local readability. Request-scoped logger auto-tags `reqId`, `method`, `path`, `status`.
- Response rounding via `Math.round(x*100)/100` at controller boundary; full precision internally. Never `toFixed`, which returns a string and would silently change the response contract.

**Tested.** Integration tests via `Test.createTestingModule`: happy path; `INVALID_TIMESTAMP` (sub-second + malformed); `INVALID_RANGE` (`from >= to`); `OUT_OF_BOUNDS` (window outside dataset); null result on flat / monotonically decreasing window; `/health` returns 200 at the unprefixed path.

(The complexity assertion lives in Phase 3 at the algorithm layer, not here.)

**Commit.** `feat: add /api/analyze, /api/dataset, and /health with validation, error envelope, and JSON logging`

**Risks/dependencies.** Phase 3 complete. Risk: `/api` prefix vs `/health` carve-out misconfigured. Mitigation: integration test hitting `/health` directly (not `/api/health`) catches it immediately.

---

## Phase 5 — Security middleware, throttler, static frontend

**Goal.** Helmet + throttler + the Alpine/Pico page served same-origin.

**Built.**
- Helmet enabled; CSP tuned: `style-src 'self' 'unsafe-inline'` (for Pico's inline styles), `script-src 'self'` (Alpine loads as a committed local file, not CDN)
- `@nestjs/throttler`: 60/min on `/api/analyze`, 120/min on `/api/dataset`, `@SkipThrottle()` on `/health`
- `ServeStaticModule` serving `public/`, configured to not capture `/api/*`
- `public/index.html` — Pico, header reads "ACME — …"
- `public/vendor/alpine-x.y.z.min.js` — **a specific recent stable Alpine.js version downloaded once and committed to the repo**. Same pinning rule as npm dependencies: no CDN, no `latest`, version named explicitly in the filename so upgrades are visible commits.
- `public/app.js` — Alpine component: fetch `/api/dataset` on init → set `min`/`max` on the date pickers; analyze button disabled until both dates are valid and no request is in flight; submit at minute boundaries; render result sentence + "Show math" collapsible (`floor(funds/buyPrice)`, total profit, return on capital); inline error display; null-result rendering

**Tested.** Integration test: `/api/analyze` returns 429 after exceeding the throttle; static `index.html` served at `/`; `/api/*` is not captured by the static module. Manual browser pass: open the page locally, run analyze on a full window, on a small sub-window, on an invalid range; toggle "Show math"; submit with and without funds.

**Commit.** `feat: add Helmet, per-IP throttling, and static Alpine+Pico frontend served same-origin`

**Risks/dependencies.** Phase 4 complete. Risk: Helmet's CSP blocks Pico inline styles. Mitigation: explicit `unsafe-inline` for `style-src`; verify in browser dev tools console before commit.

---

## Phase 6 — Deploy to Railway, verify end-to-end

**Goal.** Live deployed URL working under real Railway build output; round-trip verification of every risk surface.

**Built.**
- `package.json` start script for prod (`node dist/main`)
- **`package.json` `prepare` script (Husky install) is made a no-op outside development** — guarded by `NODE_ENV !== 'production'` and not running in CI. Husky is dev-only; Railway's prod build must not attempt to install hooks. Verify by inspecting the Railway build log: no Husky install step should run in prod.
- Railway project connected to the GitHub repo; env vars (`PORT`, `NODE_ENV`, `DATA_FILE_PATH`, `LOG_LEVEL`) set in the dashboard
- README updated with the deployed URL

**Tested.** Manual round-trip on the deployed URL covering every risk surface:
- Page renders (CSP not blocking)
- `/api/dataset` populates the header
- Analyze works on the full window and on each of the four engineered phase sub-windows
- Invalid range shows the inline error
- `/health` returns 200
- Throttler returns 429 under hammering
- Sub-second timestamp rejected with `INVALID_TIMESTAMP`
- Railway build log shows no Husky install step ran in prod

If any check fails, fix in a follow-up commit before declaring the phase done — the round-trip is the test.

**Commit.** `chore: deploy to Railway and verify end-to-end on live URL`

**Risks/dependencies.** Phase 5 complete. Highest-risk phase: `ServeStaticModule` + `/api` prefix + Railway build output composition all interact and can't be fully verified without an actual deploy.

---

## Phase 7 — Documentation, Postman collection, polish

**Goal.** Reviewer-facing materials and git-history clean-up.

**Built.**
- `docs/stock-analyzer.postman_collection.json` — folders: Health, Metadata, Happy path, Errors; each request named + described; `baseUrl=http://localhost:3000` environment variable
- `README.md` covering:
  - What it is; architecture overview (one paragraph)
  - Run locally; run tests; how CI works
  - Deployed URL
  - **Tiebreaker interpretation with the worked example inlined directly** (not deferred to the brief — reviewers may read the README without opening `docs/`):

    > *Prices `[5, 6, 5, 6]`. Maximum profit is 1, achievable two ways: buy at index 0, sell at index 1; or buy at index 2, sell at index 3. The earliest-buy-primary rule selects the first pair (index 0 → index 1).*
  - Funds rule: `floor(availableFunds / buyPrice)` shares, computed client-side; server doesn't see funds
  - API contract (request shapes + response shapes + error codes table)
  - Postman usage, including the "update `baseUrl` to the Railway URL" note
  - "Further reading" linking `docs/01-stock-analyzer-analysis.md` and `docs/02-stock-analyzer-brief.md`
  - Future-work section
- **Git-history clean-up at end of phase:** review `git log --oneline` for the entire branch. If any commits are noisy, non-atomic, or have weak messages, run an interactive rebase to clean them up before the final push. Confirm no `console.log` debris and no commented-out code remain.

**Tested.** Import the Postman collection into Postman; run each request against local and deployed; all green. Execute the README's run-locally instructions from a clean clone to verify they're complete and correct.

**Commit.** `docs: add README, Postman collection, and reference brief/analysis docs`

**Risks/dependencies.** Phase 6 complete (deployed URL known).
