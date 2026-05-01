# Multiple-optima disclosure in the result UI — Requirements

> **Status:** Planning — drafted, not yet approved.

Local contract for surfacing in the "Show math" panel whether the picked `(buy, sell)` pair is the unique optimum or one of several pairs achieving the same maximum profit. When alternatives exist, the panel says so and names the tiebreaker rule that selected the displayed pair.

This is independent of and complementary to [`docs/todo/optimality-evidence/requirements.md`](../optimality-evidence/requirements.md). Implementation order is open: either can land first, both extend the same `<details>` Show-math panel without conflict.

## Goal

When the algorithm picks a `(buy, sell)` pair, the user currently has no way to know whether that pair was uniquely optimal or one of many candidates with the same profit. The brief's "earliest and shortest" tiebreaker rule is documented in the README and asserted by tests, but the running app is silent about it.

After this change, the Show-math panel renders one of two messages:

- **Unique optimum:** _"This `(buy, sell)` pair is the only one achieving $X.XX per share in the requested window."_
- **Multiple optima:** _"N+1 `(buy, sell)` pairs achieve $X.XX per share in the requested window. Selected: buy at HH:MM:SS UTC, sell at HH:MM:SS UTC — earliest-buy primary, earliest-sell secondary."_

Where N is the number of alternatives (i.e. _other_ optimal pairs not selected). If providing a count is non-trivial (see Decisions), a boolean fallback is acceptable: _"Multiple `(buy, sell)` pairs achieve $X.XX per share..."_ without the count.

## Out of scope (explicitly)

- **Listing the alternative pairs themselves.** Showing a table of every alternative (buy, sell, ranked by tiebreaker preference) is information overload for the typical user and would multiply the rendering surface. The disclosure is binary plus optional count; the **picked** pair is the only one named.
- **Visual highlighting on a chart.** No chart exists in the app today; adding one is `docs/02-stock-analyzer-brief.md` Future Work, not this work.
- **Algorithm changes that affect the picked pair.** The tiebreaker rule (earliest-buy primary, earliest-sell secondary) stays exactly as today. This work _surfaces_ the rule's effect; it doesn't change the rule.
- **Backwards compatibility for clients consuming the API.** The new field is additive; existing clients ignoring it are unaffected.
- **Counting alternatives via brute force.** A naive O(n²) scan over all `(i, j)` pairs is too slow for the 23,400-tick dataset. The counter — if implemented — must extend the existing single-pass O(n) algorithm.

## Decisions

1. **One new boolean field on the API response: `hasAlternatives: boolean`.** True when at least one other `(buy, sell)` pair achieves the same `profitPerShare` as the picked one. Always emitted in successful responses; null in null-result responses.

2. **Counting alternatives is deferred.** A precise count requires either a second pass (O(n) extra time) or a more elaborate data structure during the main pass. Boolean disclosure is enough for the UX message ("multiple optima exist; we picked this one"). Adding a count is a future extension if a reviewer asks; spec it then.

3. **Two flavours of alternative the algorithm must detect:**
   - **Same-min-price multiple buys** — multiple ticks share the price the algorithm picked as the "buy" min. The algorithm picks the earliest one (running-min scan with strict `<` update), but the equal-priced later tick is also a valid "buy" — paired with the same sell, it yields an alternative.
   - **Same-profit multiple sells** — multiple ticks pair with the running-min to yield the same maximum profit. The algorithm picks the earliest sell (the first time the maximum was achieved). Later ticks at the same effective profit are alternatives.

   Both flavours are detectable within the existing single-pass O(n) scan with one extra counter (`minPriceCount`) and one extra equality check.

4. **The picked pair stays exactly as today.** This work changes only what's _reported_, not what's _picked_. Existing tiebreaker tests in `src/analysis/best-trade.spec.ts` assert the picked indices; those assertions stay green.

5. **The Show-math panel renders one new conditional sentence.** No new sub-section, no expansion. Place it as the first row of the `<ul>` inside `<details>`, above the existing per-share-profit row, so the disclosure is the first thing the user reads when they expand "Show math".

## Deliverables

1. **`src/analysis/best-trade.ts`** — `BestTrade` interface gains `hasAlternatives: boolean`. The `bestTrade()` function tracks two new local variables during the existing single-pass scan: `minPriceCount` (number of ticks at the current running min) and `hasAlternatives` (set true when an equal-profit pair is detected at any flavour). Returns `{ buyIndex, sellIndex, profit, hasAlternatives }`.

2. **`src/analysis/best-trade.spec.ts`** — TDD-first per CLAUDE.md. New test cases:
   - `[5, 6, 5, 6]` → picked (0, 1), `hasAlternatives: true` (alternative is (2, 3) with same profit). The existing tiebreaker test for this case stays green; the new field gets a separate assertion.
   - `[1, 5, 1, 4]` → picked (0, 1), `hasAlternatives: true` (alternative (2, ?) — actually let me re-derive: pairs with profit 4 are (0,1)=4 and (2,?)... 1+4=5 only at idx 1, but idx 2 < idx 1? No. So this case actually has no alts. Use a different shape: `[1, 5, 1, 5]` → picked (0,1) profit 4, alternatives (0,3) and (2,3) both profit 4 → `hasAlternatives: true`).
   - `[1, 4, 2, 5]` → picked (0, 3) profit 4, no alternatives → `hasAlternatives: false`.
   - Edge cases: empty array, single-element, monotonically decreasing, all-equal — `bestTrade` returns null in these cases (existing behavior); `hasAlternatives` is irrelevant when the result is null.

3. **`src/api/response-mapper.ts`** — extend `AnalyzeResponse` type and `mapAnalyzeResponse()` to surface `hasAlternatives`. One field, additive.

4. **`src/api/api.spec.ts`** — extend the existing happy-path test to assert `hasAlternatives` is present and a boolean. Add one test for a known-alternatives input via a synthetic dataset (mock the repository to return the `[5, 6, 5, 6]` array, expect `hasAlternatives: true` in the response).

5. **`public/index.html`** — Show-math panel `<ul>` gains a new first `<li>`. Conditional rendering via `x-text` and a small Alpine getter:

   ```js
   get optimaDisclosure() {
     if (!this.state.result) return null;
     if (!this.state.result.hasAlternatives) {
       return `This (buy, sell) pair is the only one achieving ${formatCurrency(this.state.result.profitPerShare)} per share in this window.`;
     }
     return `Multiple (buy, sell) pairs achieve ${formatCurrency(this.state.result.profitPerShare)} per share in this window. Selected: buy at ${formatTimeOnly(this.state.result.buy.time)} UTC, sell at ${formatTimeOnly(this.state.result.sell.time)} UTC — earliest-buy primary, earliest-sell secondary.`;
   }
   ```

6. **`docs/stock-analyzer.postman_collection.json`** — update the Happy path → Full window request description to mention `hasAlternatives` with its expected value for the canonical full-window result. Other requests stay unchanged.

## TDD scope

Per CLAUDE.md:

- **TDD** for `src/analysis/best-trade.ts`: write failing tests first, extend the algorithm, observe green. The brute-force property test in `best-trade.spec.ts` should be extended to also assert `hasAlternatives` matches a brute-force-computed reference.
- **Test-after** for the controller, response mapper, and frontend.

## Required tests

- **Algorithm unit tests (TDD):**
  - `[5, 6, 5, 6]` returns `hasAlternatives: true` and the picked (0, 1) pair (existing assertion).
  - `[1, 5, 1, 5]` returns `hasAlternatives: true` (multiple buys at min AND multiple sells at peak).
  - `[1, 4, 2, 5]` returns `hasAlternatives: false`.
  - `[1, 2, 3, 4]` (strictly ascending) returns `hasAlternatives: false`.
  - Brute-force property test: extend the existing 100-randomised-arrays test. The brute-force reference computes the actual count of optimal pairs; the test asserts `optimised.hasAlternatives === (bruteForceCount > 1)` when the result is non-null.

- **API integration test:**
  - Happy path: assert `hasAlternatives` is a boolean.
  - Synthetic dataset with known alternatives: mock the repository to return `[5, 6, 5, 6]` (or similar); assert response has `hasAlternatives: true`.

## Out of test scope

- **Counting precision tests.** The boolean disclosure is the contract; counting is not in scope.
- **Performance regression tests.** The algorithm change adds two integer increments per loop iteration; impact is negligible. The existing complexity assertion (~100ms wall clock for 23,400 ticks) covers this.

## Manual verification

Browser sweep against `node dist/main.js`:

1. Submit the full window → result panel renders, expand "Show math", confirm the optima-disclosure line appears as the first row.
2. Submit a known-multiple-optima window — possibly hard to construct from the synthetic dataset (whose phases are designed for distinct trends, not flat ties). If no natural multiple-optima window exists in `data/acme.json`, verify via the unit tests (which use synthetic arrays) and document that the live UI's "alternatives" path is exercised by integration tests rather than ad-hoc submission.
3. DevTools console: zero new errors, zero CSP violations.

## Success criteria

- `hasAlternatives` field present in every successful `AnalyzeResponse` with correct boolean value.
- All existing tests green; new tests green.
- Show-math panel renders the unique-optimum or multiple-optima sentence per the picked result, formatted with the existing currency and time helpers.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high` all clean.
- Single atomic commit. Suggested message: `feat(api,frontend): disclose multiple-optima cases in the result UI`.

## Dependencies

- **Phase 3 (algorithm + tests):** existing `bestTrade` and its test suite. This work extends both.
- **Phase 4 (API + DTOs):** `AnalyzeResponse` shape and the response mapper. Extending the contract additively.
- **`docs/todo/optimality-evidence/`:** independent. Either can land first; both write to the same `<details>` Show-math panel but to different `<li>` rows. Implementing both delivers a richer math panel but the order doesn't matter.

## Risks

- **Detecting alternatives from non-running-min buys.** The single-pass O(n) algorithm only considers `(running_min_idx, j)` pairs. Alternative buys at the same min price (different earlier index) are not directly visible to the loop. Mitigated by tracking `minPriceCount` — incremented when a price equals the current running min — so we know "there were N buys at this min price" at the time a profit-equality is detected.
- **Brute-force property test correctness.** The test asserts `optimised.hasAlternatives` matches the brute-force count's `> 1` check. The brute-force enumeration must include _all_ pairs achieving the max profit, not just the picked one. Mitigated by writing the brute-force pass to count first (over all O(n²) pairs), then derive the boolean.
- **Show-math panel verbosity.** Adding a sentence to every result, even when the answer is "yes, this is unique," may feel like over-explanation for the common case. Mitigated by keeping the unique-optimum message short and informational, not warning-toned. If reviewers find it noisy, demote the unique-optimum case to silent (only render the multiple-optima case).
- **The synthetic dataset may not naturally produce multiple-optima windows.** `data/acme.json` is hand-tuned to produce distinct trends per phase, which makes profit ties unlikely. The live UI's "alternatives" branch may rarely be exercisable via submission; the unit and integration tests carry the verification burden. Document this in the eventual commit.
- **Future-work contention with the optimality-evidence backlog.** Both specs propose adding to the Show-math `<ul>`. They don't collide on shared lines, but a reviewer reading both should know they're complementary, not duplicate. Both specs cross-link in the "Dependencies" section above.
