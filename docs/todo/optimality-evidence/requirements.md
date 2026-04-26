# Optimality evidence in the result UI — Requirements

> **Status:** Planning — drafted, not yet approved.

Local contract for surfacing per-result optimality evidence in the "Show math" section of the analyzer page. Companion to but not blocked on `docs/design_changes/` (the branding pass).

This is a small **feature change**, not a styling change. It touches the API contract, the response mapper, the integration tests, and the frontend math template. It is **not** part of the branding work and should land as its own commit.

## Goal

Make the "Show math" panel demonstrate that the algorithm's chosen `(buy, sell)` pair is the optimal one for the requested window — not just disclose the chosen pair. Today the panel shows the per-share profit and (optionally) the funds-derived share count. Both are arithmetic outputs; neither is evidence of correctness.

After this change, the panel additionally shows:

1. **Concrete picked positions** within the window — which tick number the buy and sell came from, and the window's total tick count.
2. **Constructive optimality boundary** — the global min and max of the window. When min temporally precedes max, that's a self-evident upper bound: no pair can beat `max − min`, and the algorithm's picked pair achieves it. When min comes after max temporally, the panel says so explicitly, signalling the algorithm did non-trivial running-minimum work to find the best local pair.

The framing: a reviewer reading the page should be able to say "the answer makes sense given the window's shape" without re-running the algorithm.

## Out of scope (explicitly)

- **Showing the full price array or rendering a chart.** Listed as Future Work in `docs/02-stock-analyzer-brief.md`. A chart is the strongest visual proof but adds a charting library, new endpoint, new tests, and visual-regression risk.
- **Tracking a "second-best" trade.** Considered (Approach C in the planning conversation) and rejected: the tiebreaker semantics for runner-up are ambiguous (next-best by profit? next-best non-overlapping?) and the resulting evidence is weaker than the min/max boundary check.
- **Citing the brute-force property test in the UI.** Considered (Approach A) and dropped per user direction; the test still exists and still runs, but we don't surface its existence in the running app.
- **Algorithm changes.** `bestTrade()` stays exactly as-is. The new fields are computed alongside it (one extra O(n) pass for min/max) and surfaced through the response mapper. No changes to `src/analysis/best-trade.ts`.
- **Documentation in the README.** The new fields are exposed via the API but the README's "API at a glance" section already implicitly relies on the Postman collection for the full contract. Postman descriptions get updated to mention the new fields. README itself stays as-is.
- **A separate `/api/prices` endpoint.** Not needed for this feature. The price array stays internal to the repository.

## Decisions

1. **Five new response fields.** Add to the success-case `AnalyzeResponse`:
   - `buyIndex: number` — zero-based tick position within the requested window where the algorithm bought.
   - `sellIndex: number` — same, for the sell.
   - `windowSize: number` — total tick count in the requested window (so the user can read "tick #13 of 23,400").
   - `minPriceInWindow: { time: string; price: number }` — global minimum within the window, with its UTC timestamp at second precision.
   - `maxPriceInWindow: { time: string; price: number }` — global maximum within the window, same shape.

2. **Min/max scan lives in the controller, not the algorithm.** Compute min/max in `AnalyzeController` after `bestTrade()` returns, on the same `prices` slice. Single pass, O(n). Keeps `bestTrade()` focused on the (buy, sell) decision and avoids polluting its return type with diagnostic data.

3. **Null-result handling.** When `bestTrade()` returns null (no profitable trade exists), the response stays in its existing null-result shape (`buy: null`, `sell: null`, `profitPerShare: null`). The new fields **still apply**:
   - `buyIndex: null`, `sellIndex: null`, `windowSize: <n>`, `minPriceInWindow: {...}`, `maxPriceInWindow: {...}`.
   - The frontend uses `minPriceInWindow.price === maxPriceInWindow.price` to identify a flat window, and `minPriceInWindow.time > maxPriceInWindow.time` to identify a strictly descending window — both render dedicated explanations in the math panel.

4. **Index numbering convention.** `buyIndex` is **zero-based** in the API response (matches `bestTrade()`'s internal convention). The UI displays as `tick #N+1` (1-based, human-readable) — the conversion happens frontend-side. Document this delta in both the controller and the frontend so future readers don't trip on the off-by-one.

5. **Time precision on min/max timestamps.** `minPriceInWindow.time` and `maxPriceInWindow.time` use the same second-precision UTC ISO 8601 format as `buy.time` and `sell.time`. Computed via the existing index↔time helper using `intervalSeconds` from the dataset metadata.

6. **Show-math UX shape.** Rewritten `<details>` content (in this order):
   - **Per-share profit:** $X (existing).
   - **Picked positions:** "Buy at tick #N₁ of W (HH:MM:SS UTC, $X.XX). Sell at tick #N₂ of W (HH:MM:SS UTC, $Y.YY)."
   - **Window boundary:** "Min in window: $A at HH:MM:SS UTC. Max in window: $B at HH:MM:SS UTC."
   - **Optimality assertion** — one of three messages depending on the boundary case:
     - **Trivial-optimal** (`min.time < max.time`): "Min precedes max → optimal profit = max − min = $Z. The algorithm's picked pair achieves this bound."
     - **Non-trivial** (`min.time > max.time` and a profitable trade exists): "Max occurs before min in this window. The algorithm did running-minimum work to find the best local pair: buy at $X.XX (the lowest price up to the sell time), sell at $Y.YY."
     - **No-trade flat** (`min.price == max.price`): "All prices in this window are equal. No profitable trade is possible."
     - **No-trade descending** (`min.time > max.time` and no profitable trade): "Window is strictly descending — no pair satisfies buy.time < sell.time AND buy.price < sell.price."
   - **Funds rows** (existing — shares affordable, total profit, only when funds is positive).

## Deliverables

1. **`src/api/response-mapper.ts`** — extend `AnalyzeResponse` type and `mapAnalyzeResponse()` function with the five new fields. Mapper signature gains the prices array (or pre-computed min/max bundle) so it can produce the new fields.
2. **`src/api/analyze.controller.ts`** — after the `bestTrade()` call, run a single-pass min/max scan over the same `prices` slice. Pass the results into the mapper. Keep the existing rounding rule (`Math.round(x*100)/100`) for the new prices.
3. **`src/api/api.spec.ts`** — extend the existing happy-path assertions to cover the five new fields' presence, types, and bounds (`buyIndex < sellIndex`, `windowSize > 0`, `minPriceInWindow.price <= maxPriceInWindow.price`). Add at least one edge-case test for the flat-window null-result shape (`minPriceInWindow.price === maxPriceInWindow.price`).
4. **`public/index.html`** — rewrite the `<details>` block to render the new shape per Decision 6.
5. **`public/app.js`** — pure templating helpers if any (e.g., a `tickHumanIndex` helper that returns `result.buyIndex + 1` so the template doesn't repeat the +1). No reactivity changes.
6. **`docs/stock-analyzer.postman_collection.json`** — update the "Happy path → Full window" request description to mention the new fields with their expected values for the canonical full-window result. Other requests can stay unchanged (descriptions are illustrative, not exhaustive).

## TDD scope

Per CLAUDE.md:

- **TDD** for `src/analysis/*` and `src/data/*` only — neither is changed in this work.
- **Test-after** for controllers, DTOs, and frontend — applies here. Write the controller change, observe it failing the existing test (because the new fields aren't asserted), extend the assertions, ship.
- The min/max scan itself is two lines of arithmetic — no separate unit test required if its results are covered by the controller integration test.

## Required tests

- **Existing happy-path tests in `api.spec.ts`** must extend to assert the five new fields. Specifically:
  - `buyIndex` is an integer in `[0, windowSize)` and `< sellIndex`.
  - `sellIndex` is an integer in `(buyIndex, windowSize)`.
  - `windowSize` is a positive integer matching `(toIndex - fromIndex + 1)` of the requested window.
  - `minPriceInWindow.price` is a finite number; `maxPriceInWindow.price` is a finite number; `min ≤ max`.
  - Both timestamps are second-precision UTC ISO 8601 within the requested window.

- **One new edge-case test** for null-result with flat prices: construct a synthetic dataset where all prices in the requested window are equal, assert the response has `buy: null`, `sell: null`, `profitPerShare: null`, but `minPriceInWindow.price === maxPriceInWindow.price` and `windowSize` is correct.

- **Existing edge cases in `api.spec.ts`** (single-tick window, descending prices) get extended assertions covering the new fields' shape; no new tests if those cases already exist.

## Out of test scope

- **Visual regression** of the rewritten "Show math" panel. Manual browser sweep covers this same as the branding work.
- **Unit-testing the min/max scan in isolation.** It's two lines; the integration tests cover its outputs.
- **Property-style randomised tests for the new fields.** The optimality-of-`bestTrade` invariant is already covered by the existing brute-force property test in `src/analysis/best-trade.spec.ts`. Adding randomised tests for min/max would be re-asserting a built-in JavaScript primitive (`Math.min`/`Math.max`).

## Manual verification

Browser sweep against `node dist/main.js` (mirroring the `I` section pattern from `docs/design_changes/tasks.md`):

1. Submit the full window — math panel renders all five new lines including the trivial-optimal assertion message.
2. Submit a sub-window that starts at the dataset's high and ends at its low — math panel renders the **non-trivial** assertion message.
3. Submit a 2-second window where the second tick is lower than the first — null-result, math panel renders the **descending no-trade** message.
4. Submit a 1-second window — null-result (no two ticks), math panel renders a degenerate-window message (or an existing no-trade message; decide during implementation if degenerate-window deserves its own copy).
5. Console: zero CSP violations, network has only same-origin requests.

## Success criteria

- All five new fields appear in every successful and null-result `AnalyzeResponse`, with correct types and values.
- All existing tests still pass; new assertions and at least one edge-case test land green.
- The "Show math" panel renders the correct optimality assertion for each of the three boundary cases (trivial, non-trivial, flat) verified during the manual sweep.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high` all clean.
- Single atomic commit. Suggested message: `feat(api,frontend): expose window min/max and indices for per-result optimality evidence`.

## Dependencies on prior phases / work

- **Phase 4 (API + DTOs):** `AnalyzeResponse` shape and the `mapAnalyzeResponse` mapper. Extending the contract; not redesigning it.
- **Phase 2 (data + repository):** `intervalSeconds` from the dataset metadata, used by the existing index↔time helper.
- **`docs/design_changes/`:** independent. The branding work doesn't change the API contract; this work doesn't change visuals beyond the math panel content. Branding can land first, this can land second, and they don't conflict on any shared file beyond `public/index.html` (different sections — branding touches the form/header, this touches the result `<details>`).

## Risks

- **Off-by-one on `windowSize`.** The window is inclusive on both ends per the existing API contract, so `windowSize = sellIndex_max + 1 = (toEpoch - fromEpoch) / intervalSeconds + 1`. Easy to get wrong if implemented as `toEpoch - fromEpoch`. Mitigation: dedicated unit assertion in the controller test plus a comment naming the inclusive convention.
- **Min/max with ties.** If two ticks share the minimum price (or maximum), which timestamp do we return? Decision: **earliest** for both — matches the algorithm's earliest-buy / earliest-sell tiebreaker philosophy. Document at the implementation site.
- **Non-trivial boundary message wording reading as "the algorithm did poorly".** It shouldn't — the message is meant to communicate "this case is non-degenerate and the algorithm earned its keep." Mitigation: word-smith during implementation; show the user before commit.
- **Frontend tick-index off-by-one display.** `buyIndex` is zero-based in the API; the UI shows 1-based. If the helper isn't used, two of the rendered indices could disagree. Mitigation: extract a single helper, route both buy and sell display through it, comment its purpose.
- **Postman collection drift.** If the Postman descriptions name old field counts or shapes, they'll be subtly wrong after this commit. Mitigation: include the Happy path → Full window description update in the same commit as the API change, not as a follow-up.
- **No-trade descending window detection.** The frontend uses `min.time > max.time` to identify the descending case, but if `bestTrade()` returns null, the user might also be in a flat window (`min.price === max.price`). Order matters: check flat first, then descending. Otherwise a flat window would render the descending message. Mitigation: explicit branching order in the template, with a comment.
