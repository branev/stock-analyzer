# Phase 3 — Algorithm

Local contract for Phase 3. Companion to the authoritative roadmap in `docs/03-implementation-plan.md`; this document is the per-phase scope agreement.

## Goal

Implement the best-buy/best-sell algorithm as a pure function, validated against a brute-force reference, with the complexity assertion made directly at the algorithm layer.

## Deliverables

1. **`src/analysis/best-trade.ts`** — pure function `bestTrade(prices)` returning the optimal buy/sell pair as indices (or `null` for no profitable trade), with the tiebreaker applied.
2. **`src/analysis/best-trade.spec.ts`** — colocated unit tests covering the TDD example sequence, the three hand-crafted tiebreaker cases, the randomised brute-force property test, and the complexity assertion.
3. **No NestJS wiring.** The function is imported directly. Phase 4 wraps it in an `Injectable` service if controller DI requires it; Phase 3 doesn't anticipate that.

## Public contract

```ts
export interface BestTrade {
  buyIndex: number; // 0-based index into the input array
  sellIndex: number; // 0-based index, > buyIndex
  profit: number; // prices[sellIndex] - prices[buyIndex], strictly > 0
}

export function bestTrade(prices: readonly number[]): BestTrade | null;
```

- Input is whatever the repository returned: a contiguous slice of float prices.
- Output indices are relative to the input array (callers map back to timestamps using their own metadata).
- `null` means "no profitable trade exists in this window" — flat, monotonically non-increasing, single-point, or empty arrays.
- `profit` is computed in full precision; no rounding here. The Phase 4 response mapper rounds at the API boundary.

## Algorithm

Single-pass running-minimum, scanning left to right.

**Invariants maintained:**

- `minPriceSoFar`, `minPriceIndex` — the lowest price seen so far and where it occurred.
- `bestBuyIndex`, `bestSellIndex`, `bestProfit` — the current best trade, or "none yet."

**At each index `i`:**

1. Compute `profit = prices[i] - minPriceSoFar`.
2. If `profit > bestProfit`: record `{ buyIndex: minPriceIndex, sellIndex: i, profit }` as the new best.
3. If `prices[i] < minPriceSoFar`: update `minPriceSoFar` and `minPriceIndex`.

The strict `>` in step 2, plus the fact that `minPriceIndex` only moves forward, give the **earliest-buy / earliest-sell** tiebreaker for free. The brute-force reference (used in tests only) confirms this emergent behaviour matches the rule explicitly.

## Tiebreaker rule

Reaffirmed from the brief: when multiple trades have equal profit, return **earliest-buy primary, earliest-sell secondary**. The worked example `[5, 6, 5, 6]` (max profit 1, two valid pairs at indices 0→1 and 2→3) selects 0→1.

## Brute-force reference (test-only)

A simple `O(n²)` enumeration colocated in the spec file:

```ts
function bruteForce(prices: readonly number[]): BestTrade | null {
  let best: BestTrade | null = null;
  for (let i = 0; i < prices.length; i++) {
    for (let j = i + 1; j < prices.length; j++) {
      const profit = prices[j] - prices[i];
      if (profit > 0 && (best === null || profit > best.profit)) {
        best = { buyIndex: i, sellIndex: j, profit };
      }
    }
  }
  return best;
}
```

Iteration order plus the strict `>` give the same tiebreaker semantics as the optimised version. The reference is used as the **oracle** in two contexts:

1. The three hand-crafted tiebreaker tests — equality assertions against the reference's output.
2. The randomised property test — 100 arrays of length 20, each compared against the reference.

## Tests required

### TDD example sequence (test-first)

In order, each a red → green → refactor cycle:

1. Empty array → `null`.
2. Single-point array → `null`.
3. Two-point ascending (`[10, 20]`) → buy 0, sell 1, profit 10.
4. Two-point descending (`[20, 10]`) → `null`.
5. Three-point with peak (`[10, 30, 20]`) → buy 0, sell 1, profit 20.
6. Flat (`[10, 10, 10]`) → `null`.
7. Monotonically decreasing (`[30, 20, 10]`) → `null`.
8. Boundary-inclusive — first index can be the buy, last index can be the sell.

### Hand-crafted tiebreaker cases (vs brute-force)

Each test compares the optimised output against the brute-force reference for that exact input. The test fails if either implementation produces the wrong answer or if they disagree.

- `[5, 6, 5, 6]` → buy 0, sell 1, profit 1. (Two pairs share the max profit; earliest buy wins.)
- `[5, 5, 5, 5]` → `null`. (All equal; zero profit is not a trade.)
- `[5, 6, 6, 5]` → buy 0, sell 1, profit 1. (Two pairs share the max profit from the same buy; earliest sell wins.)

### Randomised brute-force property test (mandatory, not nice-to-have)

A discrete required test:

- Seeded RNG (fixed seed; deterministic across runs).
- Generates **100 arrays of length 20** with small integer prices (e.g. `0..50`) so the brute-force is fast and tiebreaker situations occur frequently.
- For each array, asserts `expect(bestTrade(arr)).toEqual(bruteForce(arr))` — including `null` results and including tiebreaker indices.

If the optimised version regresses on a corner case the author didn't think of, the property test catches it.

### Complexity assertion (lives here, not in Phase 4)

A discrete test that:

- Loads `data/acme.json` (the committed Phase 2 dataset, ~23,400 ticks).
- Calls `bestTrade(prices)` once, measuring wall-clock with `performance.now()`.
- Asserts the elapsed time is **under 100ms**.

This pins down O(n) at the algorithm layer. The Phase 4 HTTP layer doesn't repeat the timing check — it has its own concerns (validation, serialisation, error envelope).

## In scope

- The pure `bestTrade` function and its tests.
- The brute-force reference (test-only).
- The randomised property test (seeded, deterministic).
- The complexity assertion against the committed dataset.

## Out of scope (deferred to later phases)

- HTTP wiring, controllers, DTOs, error envelope — Phase 4.
- API-boundary rounding (`Math.round(x*100)/100`) — Phase 4 (in the response mapper).
- Translating indices back to ISO timestamps — Phase 4 (the controller has both the algorithm result and the dataset metadata).
- NestJS DI / `Injectable` wrapping — Phase 4 only if the controller needs it.
- Frontend, throttler, CSP — Phase 5.

## TDD scope

Per CLAUDE.md:

- **TDD (red → green → refactor):** `src/analysis/*` — every primitive case and edge case in the example sequence is a failing test before any production code exists.
- **Test-after / not separately tested:** the brute-force reference is exercised through the property test and the hand-crafted cases; we don't write tests for the reference itself (it's an obvious-by-construction implementation, not our production code).

## Out of test scope

Tests validate our code's contract, not third-party behaviour or internal state. The following are explicitly **not** tested in Phase 3:

- **The brute-force reference's correctness in isolation.** It's defined to be the oracle. If it's wrong, tests fail and we fix the reference; no separate test suite for it.
- **Internal scan state.** `minPriceSoFar`, `minPriceIndex`, intermediate values during the loop — implementation details. Tests assert only the final return value.
- **Microbenchmark variance.** The 100ms bound is generous (~50× headroom for an O(n) scan over 23k integers). We don't try to assert tighter bounds or measure CPU instructions; the goal is "catches O(n²) regressions," not "proves microsecond-level performance."
- **Timestamp arithmetic.** The algorithm operates on indices; mapping indices to timestamps is the controller's job in Phase 4. We don't test "the buy timestamp is correct" here.
- **Float-precision idiosyncrasies of the input.** If the repository hands us prices like `158.94` that produce `16.770000000000003` from subtraction, both the optimised and brute-force code produce the _same_ artifact, so equality holds. We don't test "rounding is correct" here — that's Phase 4's response mapper.
- **Third-party library correctness.** `Math`, `Number`, `performance.now()`, `JSON.parse`, etc. assumed correct.
- **NestJS framework wiring.** No DI in Phase 3.

## Success criteria

- Every primitive in the TDD example sequence is exercised by a failing test before any production code exists.
- The three hand-crafted tiebreaker tests pass and use brute-force comparison rather than hardcoded expectations.
- The randomised property test runs 100 inputs deterministically and passes.
- The complexity assertion runs against the committed `data/acme.json` and completes under 100ms.
- `npm run lint` clean; `npm run typecheck` clean; `npm test` all green; `npm run build` clean; `npm audit --audit-level=high` clean.
- Phase 3 lands as a single atomic commit with the exact message in the implementation plan: `feat: add best-trade algorithm with explicit tiebreaker, brute-force reference, and complexity assertion`.

## Dependencies on prior phases

- **Phase 0 (CLAUDE.md):** TDD scope rule, atomic commits, AAA, no-anticipation.
- **Phase 1 (scaffold):** strict TypeScript, ESLint, Prettier, Husky pre-commit, Jest configured.
- **Phase 2 (repository):** the committed `data/acme.json` is the input for the complexity assertion. The algorithm consumes the same `readonly number[]` shape that `getPriceSeries` returns.

## Risks

- **Tiebreaker right-by-coincidence.** The natural iteration order of the single-pass-with-running-minimum produces the earliest-buy / earliest-sell answer "for free." A future refactor (e.g. a parallel scan, a divide-and-conquer variant) could silently break the tiebreaker without altering the profit. Mitigated by the brute-force property test and the three hand-crafted cases — both compare on indices, not just on profit.
- **Float-precision drift between optimised and reference.** Both implementations subtract the same operands, so they produce the same IEEE 754 artifacts. Equality assertions hold. If a future refactor introduced different arithmetic order (e.g. running max instead of running min), float artifacts could diverge. The randomised test would catch it.
- **Performance test flakiness on slow CI runners.** The 100ms bound is intentionally loose. If it ever flakes, the bound itself is the problem, not the algorithm — investigate before raising it.
