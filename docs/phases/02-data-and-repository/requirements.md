# Phase 2 — Data and Repository

Local contract for Phase 2. Companion to the authoritative roadmap in `docs/03-implementation-plan.md`; this document is the per-phase scope agreement.

## Goal

Produce a deterministic synthetic dataset and a swappable repository layer that loads it at boot, validates it, and exposes the two operations the rest of the system depends on.

## Deliverables

1. **Mock-data generator** — `scripts/generate-mock-data.ts`. Seeded RNG with the fixed constant `0xACE`. Composes a single trading session from four named windows and writes `data/acme.json`. Reproducible: re-running the generator with the same seed produces a byte-identical file.
2. **`data/acme.json`** — committed output of the generator.
3. **Price repository** — `src/data/`:
   - `PriceRepository` (abstract class) — DI seam declaring the two operations.
   - `FilePriceRepository` (implementation) — loads the JSON at boot via NestJS lifecycle, runs the integrity check, exits the process on failure, holds the parsed payload in memory for the lifetime of the process.
   - Whatever DataModule / provider wiring is needed to inject `FilePriceRepository` for `PriceRepository` and to register `DATA_FILE_PATH` from `@nestjs/config`.
4. **Repository test suite** — colocated `*.spec.ts` files. AAA structure. Real fixture files in temp dirs (no `fs` mocking).
5. **`generate:mock-data` npm script** — invokable as `npm run generate:mock-data`.

## Repository interface

```ts
abstract class PriceRepository {
  abstract getDataset(): DatasetMetadata;
  abstract getPriceSeries(from: Date, to: Date): readonly number[];
}

interface DatasetMetadata {
  symbol: string;
  name: string;
  currency: string;
  from: Date;
  to: Date;
  intervalSeconds: number;
}
```

`getPriceSeries` returns the contiguous slice of prices for the inclusive `[from, to]` window. Throws an `OutOfBoundsError` (domain error, not an HTTP exception) if either endpoint falls outside the dataset's covered period. The controller layer is responsible for translating that domain error into the HTTP envelope in Phase 4.

## Generator specification

### File composition

| Phase               | Window (UTC)    | Tick count | Behaviour                                        |
| ------------------- | --------------- | ---------- | ------------------------------------------------ |
| Trending AM         | 09:30–11:00     | 5400       | Steady upward drift, low noise                   |
| Choppy mid          | 11:00–12:30     | 5400       | Mean-reverting around the AM close, higher noise |
| Lunch lull          | 12:30–14:00     | 5400       | Tight range, very low noise                      |
| Sell-off into close | 14:00–16:00     | 7200       | Steady downward drift, moderate noise            |
| **Total**           | **09:30–16:00** | **23,400** |                                                  |

### Output JSON shape (must match the brief)

```json
{
  "symbol": "ACME",
  "name": "Acme Corporation",
  "currency": "USD",
  "startTime": "2026-04-22T09:30:00Z",
  "intervalSeconds": 1,
  "prices": [108.00, 108.01, 107.98, ...]
}
```

- Date hardcoded at generation time: **2026-04-22** (a recent weekday, within the last two weeks of the project's authoring date).
- Starting price: ~$108. Final range stays within ~$100–$130 for plausibility.
- Prices stored as `number` (float), rounded to two decimals via `Math.round(x * 100) / 100`. No `toFixed`.
- The generator is **the only place** that decides per-phase parameters (drift, noise amplitude, mean-reversion strength). Those parameters are not specified here — the generator owns them.

### Determinism

Fixed seed: `0xACE`. The RNG is a small inlined function (e.g. `mulberry32`); no new dependency. Re-running the generator overwrites `data/acme.json` byte-identically.

### Output verification (mandatory before Phase 2 commit)

After generating, run the algorithm against **5–6 distinct sub-windows** (ad-hoc, not codified as a permanent test):

- Full day (09:30–16:00).
- One sub-window inside each of the four named phases.
- One cross-phase window (e.g. 11:00–14:00).

Confirm the optimal buy/sell pairs differ meaningfully between windows — distinct buy/sell timestamps and meaningfully different profit magnitudes. If results are uniform or trivial, retune the per-phase parameters before committing.

## Integrity check (boot-time)

`FilePriceRepository` runs the integrity check during NestJS module initialisation. Any failure logs a specific message naming the file path and the failing condition, then exits the process with code 1. The check rejects:

1. **File missing** — `DATA_FILE_PATH` does not point to an existing file.
2. **Unparseable JSON** — file exists but is not valid JSON.
3. **`intervalSeconds` invalid** — missing, zero, negative, fractional, or non-numeric. Must be a **positive integer**.
4. **`prices` empty or missing** — must be a non-empty array.
5. **Non-numeric entries inside `prices`** — every entry must be a finite `number` (rejects strings, `null`, `NaN`, `Infinity`).

This is the entire integrity check surface. No additional spec rules apply (e.g. no monotonicity check on prices; no `startTime` format validation beyond what `new Date()` does, since `@nestjs/config` and the brief's UTC convention cover it).

## In scope

- Generator script + committed dataset.
- Repository abstract class + file-backed implementation.
- DI wiring sufficient to inject the repository elsewhere in Phase 3+.
- `intervalSeconds` is read from the parsed dataset for any index↔time arithmetic in the repository. No `1` literals.
- Test coverage for slicing, OOB, and every integrity-check rule listed above.

## Out of scope (deferred to later phases)

- HTTP layer, controllers, DTOs, validation pipe, error envelope — Phase 4.
- Algorithm — Phase 3.
- API-boundary rounding via `Math.round(x*100)/100` on response — Phase 4. (The repository hands out raw float prices as loaded.)
- Performance/complexity assertion — Phase 3 (asserted at the algorithm layer).
- Frontend, throttler, CSP — Phase 5.

## TDD scope

Per CLAUDE.md:

- **TDD (red → green → refactor):** `src/data/*` — repository implementation including slicing and integrity-check logic. Each rule and edge case is a failing test before any production code exists.
- **Test-after:** the mock-data generator (`scripts/generate-mock-data.ts`). Validated indirectly: the committed `data/acme.json` is asserted by the repository's integrity check at boot, plus an explicit "loads cleanly with the integrity check" test fixture-checks the generator's output.

## Out of test scope

Tests validate our code's contract, not third-party behaviour or internal state. The following are explicitly **not** tested in Phase 2:

- **The RNG implementation.** `mulberry32` (or whichever inlined seeded RNG is used) is a known published algorithm; we don't re-test its statistical properties or output stream.
- **The generator script directly.** Covered indirectly: the committed `data/acme.json` must pass the repository's boot integrity check, which is the only contract that matters.
- **Internal data structures of the repository.** Private fields, storage representation, and any caching/indexing decisions are implementation details. Tests only exercise the public contract — `getDataset()` and `getPriceSeries(from, to)`.
- **Third-party library correctness.** Node primitives (`fs`, `path`), `JSON.parse`, `Date`, `Math.round`, etc. are assumed correct. We don't write tests that assert "JSON.parse rejects invalid JSON" — we test that _our repository_ surfaces a meaningful error when JSON.parse throws.
- **NestJS framework wiring per phase.** The existing e2e smoke test from Phase 1 already proves the framework boots and modules compose. Phase 2 doesn't repeat that; it adds the repository-specific integration check (E5 in `tasks.md`) and trusts the framework underneath.

## Success criteria

- `npm run generate:mock-data` produces `data/acme.json` deterministically (same bytes on re-run with the same seed).
- 5–6 sub-window verification step run and produces meaningfully varied optimal trades.
- All integrity-check rules listed above are exercised by a unit test that fails when the rule is violated.
- `getPriceSeries` returns a correct contiguous slice for valid windows and throws `OutOfBoundsError` for invalid ones.
- `npm run lint` clean; `npm run typecheck` clean; `npm test` all green; `npm run build` clean; `npm audit --audit-level=high` clean.
- Phase 2 lands as a single atomic commit with the exact message in the implementation plan: `feat: add mock-data generator and file-backed price repository with boot-time integrity check`.

## Dependencies on prior phases

- **Phase 0 (CLAUDE.md):** TDD scope rule, `intervalSeconds` safety net, no-anticipation rule, atomic-commit discipline.
- **Phase 1 (scaffold):** `@nestjs/config` with the Zod env schema, `DATA_FILE_PATH` already declared in `.env.example` and validated at boot. ESLint/Prettier/Husky/lint-staged active. Strict tsconfig active. CI runs lint/typecheck/test/build/audit.

## Risks

- **Bland dataset.** The generator's random walk could produce a single-direction trend or a flat curve where most sub-windows yield the same trade. Mitigated by the explicit 5–6 sub-window verification step before commit.
- **`intervalSeconds` hardcoding drift.** The CLAUDE.md safety net exists because index↔time arithmetic is the silent-failure case. All such arithmetic in the repository must read the field from the loaded dataset.
- **Floating-point churn in committed JSON.** Without rounding to two decimals at write time, the committed file would change byte-for-byte under different platforms or future Node versions. Generator uses `Math.round(x*100)/100` to keep the file stable.
