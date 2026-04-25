# Phase 3 — Tasks

Sequential execution checklist. Work top-to-bottom. Do not skip ahead. Each task should leave the working tree in a state where lint, typecheck, and test still pass — except inside an explicit red-step of a TDD cycle.

Conventions:

- `[ ]` pending, `[x]` done.
- "TDD cycle" = one red → green → refactor pass: write a failing test (red), write the minimum code that makes it pass (green), then refactor without breaking green.
- Production code under `src/analysis/*` is TDD. The brute-force reference (test-only) is written when first needed.

---

## Section A — Algorithm skeleton

- [x] **A1.** Create `src/analysis/` directory.
- [x] **A2.** Define the `BestTrade` interface and the exported `bestTrade(prices: readonly number[]): BestTrade | null` function signature in `src/analysis/best-trade.ts`. Body throws `Error('not yet implemented')` so the next test fails for the right reason.

---

## Section B — TDD example sequence (test-first)

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

For each item below, run a complete red → green → refactor cycle.

- [x] **B1.** Cycle: empty array (`[]`) returns `null`.
- [x] **B2.** Cycle: single-point array (`[42]`) returns `null`.
- [x] **B3.** Cycle: two-point ascending (`[10, 20]`) returns `{ buyIndex: 0, sellIndex: 1, profit: 10 }`.
- [x] **B4.** Cycle: two-point descending (`[20, 10]`) returns `null`.
- [x] **B5.** Cycle: three-point with peak (`[10, 30, 20]`) returns `{ buyIndex: 0, sellIndex: 1, profit: 20 }`.
- [x] **B6.** Cycle: flat array (`[10, 10, 10]`) returns `null`.
- [x] **B7.** Cycle: monotonically decreasing (`[30, 20, 10]`) returns `null`.
- [x] **B8.** Cycle: boundary-inclusive. Fixture `[10, 5, 8, 3, 12]` → `{ buyIndex: 3, sellIndex: 4, profit: 9 }`. Tests both: boundary indices are allowed (last index is the sell), and `minPriceIndex` correctly tracks the running minimum past index 0 (the lowest price isn't at the start). A monotonic ascending fixture would be too easy — this fixture forces the running-minimum logic to actually update mid-scan.
- [x] **B9.** **Refactor pass after green-on-all.** Inspect the implementation. Confirm: single linear pass, O(1) auxiliary state, strict `>` when comparing profits (so tiebreaker is right-by-construction), `minPriceIndex` only moves forward.

---

## Section C — Tiebreaker hand-crafted cases (vs brute-force)

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

Add the brute-force reference to the spec file when this section starts (test-only, simple `O(n²)` enumeration as specified in `requirements.md`). For each case, the test asserts `expect(bestTrade(input)).toEqual(bruteForce(input))` — equality on indices and profit, not just profit.

- [x] **C1.** Cycle: `[5, 6, 5, 6]` → `{ buyIndex: 0, sellIndex: 1, profit: 1 }` (two pairs share max profit; earliest buy wins). Test compares against brute-force.
- [x] **C2.** Cycle: `[5, 5, 5, 5]` → `null` (all equal; zero profit is not a trade). Test compares against brute-force.
- [x] **C3.** Cycle: `[5, 6, 6, 5]` → `{ buyIndex: 0, sellIndex: 1, profit: 1 }` (two pairs from the same buy share max profit; earliest sell wins). Test compares against brute-force.

---

## Section D — Randomised brute-force property test (mandatory)

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

This is a **discrete required test**, not a nice-to-have. It exists because the optimised algorithm's tiebreaker is right-by-construction (emergent from iteration order), and emergent correctness breaks silently under refactor. The property test traverses cases the author wouldn't enumerate by hand.

- [x] **D1.** Add a seeded RNG to the spec file (inline mulberry32 with a fixed seed, e.g. `0xBEEF`, so the test is deterministic across runs).
- [x] **D2.** Generate **100 arrays of length 20** with small integer prices (e.g. uniformly drawn from `0..50`) so the brute-force runs fast and tiebreaker situations occur frequently.
- [x] **D3.** Use Jest's `it.each` to drive the assertion, so the failing array appears in the test name on failure (rather than buried inside a single bulk comparison):

  ```typescript
  const arrays = generateRandomArrays(100);
  it.each(arrays)('matches brute-force on %j', (arr) => {
    expect(bestTrade(arr)).toEqual(bruteForce(arr));
  });
  ```

- [x] **D4.** Confirm the test runs in under a couple of seconds locally. If it takes longer, the brute-force is slower than expected; do not silently shrink the inputs.

---

## Section E — Complexity assertion (full-day under 100ms)

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

This test lives in Phase 3, alongside the algorithm — not in Phase 4's HTTP layer. The point is to assert O(n) behaviour at the algorithm layer with no HTTP overhead in the measurement.

- [x] **E1.** Load `data/acme.json` once at the start of the test (the committed Phase 2 dataset, 23,400 ticks).
- [x] **E2.** Measure wall-clock with `performance.now()` around a single call to `bestTrade(prices)`.
- [x] **E3.** Assert the result is non-null (sanity: a 6.5-hour trading session has _some_ profitable trade).
- [x] **E4.** Assert elapsed time is **under 100ms**.
- [x] **E5.** Spot-check the result against expectation from the Phase 2 variety verification (full-day buy `2026-04-22T09:30:13Z` $107.89 → sell `2026-04-22T11:39:22Z` $129.43, profit ~$21.54). Use `toBeCloseTo` for the profit (float precision) and exact-equal for the indices.

---

## Section F — Verify and commit

- [x] **F0.** **Test self-review step.** Walk through every `it(...)` block added in Phase 3. For each, articulate two sentences:
  1. _"If this test fails, what bug in our code has been introduced?"_
  2. _"Which code path does this test actually exercise?"_

  Apply two rules:
  - If the answer to (1) involves a third-party library, NestJS framework wiring, or an implementation detail that doesn't affect the public contract — delete the test.
  - If two tests appear to test different things but exercise the same code path (answer to question 2), one is redundant — keep only the test that traverses the unique path. _(This rule was added after Phase 2's review surfaced two tests that both hit JSON-parse rejection rather than the runtime check they were nominally targeting.)_

  List the articulations and any deletions in the final report at F9.

- [x] **F1.** Run `npm run lint`. Must be clean.
- [x] **F2.** Run `npm run typecheck`. Must be clean.
- [x] **F3.** Run `npm test`. Must be all green. The new spec file (`best-trade.spec.ts`) must show in the suite list. Expected ~13 spec definitions in the file (8 B series + 3 C series + 1 D randomised + 1 E complexity). The randomised property test may produce ~100 individual test results via `it.each` — that's expected, not a regression.
- [x] **F4.** Run `npm run build`. Must be clean.
- [x] **F5.** Run `npm audit --audit-level=high`. Must report zero vulnerabilities at this level.
- [x] **F6.** `git status` review:
  - Confirm `src/analysis/best-trade.ts` and `src/analysis/best-trade.spec.ts` are present.
  - Confirm no stray test/debug scripts left on disk.
- [x] **F7.** Stage explicitly (no `git add .`):
  - `src/analysis/best-trade.ts`
  - `src/analysis/best-trade.spec.ts`
  - `docs/phases/03-algorithm/requirements.md` and `docs/phases/03-algorithm/tasks.md` (these fold into the Phase 3 commit, not a separate one)
  - Any incidental updates to `package.json` (unlikely; flag if present).
- [x] **F8.** Commit with message exactly: `feat: add best-trade algorithm with explicit tiebreaker, brute-force reference, and complexity assertion`. Include a body that summarises the algorithm shape, the tiebreaker rule and worked example, the brute-force property test (100 × 20, seeded), and the complexity assertion (full-day under 100ms).
- [x] **F9.** Confirm the pre-commit hook ran (lint-staged + typecheck) and the commit landed. Show `git log --oneline -3` and `git status`. Report the F0 articulations and any deletions.
