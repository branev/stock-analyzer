# Test quality review — 2026-04-26

Scope: all test files under `src/` and `test/`. The framework is "tests have
value proportional to the bugs they would catch" — a passing test on broken
code is worth zero. I looked for behaviours the suite would let regress, tests
that don't actually pin down the contract they claim to, and asserts that
will false-fail for non-bug reasons.

## 1. Summary

The suite is in good shape. The structure is clean (algorithm unit + property
test, repository unit, API integration with both real and mocked repos, a
route-precedence test, an e2e boot smoke), every error code in the contract
has at least one HTTP-path test, and the brute-force property test is genuine.
The most important miss is a class of malformed-but-pattern-matching
timestamps (e.g. `2026-13-01T00:00:00Z`) — the same gap that lets bug 2.1 of
the code review ship undetected. The tiebreaker tests verify the chosen
interpretation against an oracle that shares the interpretation by
construction, so a regression to the _other_ documented interpretation
("shortest-duration") would slip past the suite. The performance test pins a
specific dataset answer (buyIndex=13, sellIndex=7762) which is a deliberate
spot-check but the wall-clock 100 ms bound is the only finding I'd flag as
brittle.

## 2. Gaps

### 2.1 Regex-passing, `Date`-invalid timestamps reach the algorithm — HIGH

[src/api/api.spec.ts:171-197](src/api/api.spec.ts#L171-L197) — should also
cover this case.

The DTO's regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` accepts strings that
are syntactically well-formed but not real dates: `2026-13-01T00:00:00Z`,
`2026-02-30T00:00:00Z`, `2026-04-22T25:00:00Z`. The current "malformed from"
test uses `'not-a-date'`, which fails the regex itself and triggers the
`BadRequestException` → `INVALID_TIMESTAMP` mapping. The
regex-passing-but-`new Date()`-NaN path is structurally different: it slips
past validation, fails the `from.getTime() >= to.getTime()` guard silently
(NaN comparisons are false), and surfaces as `OUT_OF_BOUNDS` from the
repository's misalignment branch. No test exercises this path, which is why
the bug is shippable.

A single test closes the gap: `GET /api/analyze?from=2026-13-01T00:00:00Z&to=2026-04-22T15:59:59Z`
should expect status 400 and `body.code === 'INVALID_TIMESTAMP'`. Today the
same call returns 400 with `body.code === 'OUT_OF_BOUNDS'`, so the test would
fail until the controller (or DTO) gets the explicit `Number.isNaN(from.getTime())`
check that the code review proposes.

Confidence: HIGH — verified the path matches the code review's analysis;
adding the test today produces a red bar against current `main`.

### 2.2 Tiebreaker tests don't distinguish the chosen interpretation from the documented alternative — MEDIUM

[src/analysis/best-trade.spec.ts:97-133](src/analysis/best-trade.spec.ts#L97-L133)

The README explicitly calls out that "earliest and shortest" admits two
readings — (a) earliest-buy primary and (b) shortest-duration primary — and
claims (a) is the chosen one. The two tiebreaker fixtures are `[5,6,5,6]` and
`[5,6,6,5]`. On `[5,6,5,6]` both interpretations select (0,1) (the
shortest-duration ties at 1, then earliest-buy breaks the tie). On
`[5,6,6,5]` the same: pairs (0,1) and (0,2) share buy=0, so durations are 1
vs 2 and earliest-buy is also 0 — both interpretations land on (0,1). So
neither hand-crafted fixture would catch a regression that re-implemented
the algorithm under interpretation (b). The brute-force property test
([best-trade.spec.ts:9-20](src/analysis/best-trade.spec.ts#L9-L20)) doesn't
help here either: it uses strict `>` and natural i,j iteration order, which
_also_ implements interpretation (a) — by the author's own admission in the
comment at line 5-8. So a "shortest-duration primary" regression in the
optimised version would diverge from the brute-force, but only on inputs the
suite doesn't generate; the random fixtures are length 20 with values in
[0,50] and equal-profit-distinguishing cases will be very rare.

Concrete test that would close the gap: `[1, 2, 1, 4, 4]`. The profitable
pairs at max profit 3 are (0,3), (0,4), (2,3), (2,4). Interpretation (a)
selects (0,3) — earliest-buy 0 wins, then earliest-sell 3 over 4.
Interpretation (b) selects (2,3) — shortest duration 1 over 3, then
earliest-buy. Today's optimised algorithm returns (0,3); the test should
assert `expect(bestTrade([1,2,1,4,4])).toEqual({ buyIndex: 0, sellIndex: 3, profit: 3 })`.
Now a regression to interpretation (b) would flip the result to (2,3) and
the test would catch it without depending on the brute-force having the
"right" tiebreaker.

Confidence: MEDIUM — the bug class is "someone re-reads the spec and changes
the algorithm to match the alternative reading." Plausible, especially
given the README documents both readings.

### 2.3 The `intervalSeconds` spec safety net is not exercised — MEDIUM

[src/api/api.spec.ts:103-124](src/api/api.spec.ts#L103-L124),
[src/api/response-mapper.ts:35-37](src/api/response-mapper.ts#L35-L37)

CLAUDE.md says "read `intervalSeconds` from the data file in every
index↔time calculation. Never hardcode 1." The committed dataset has
`intervalSeconds = 1`, and every test fixture (the small-repo helper at
file-price.repository.spec.ts:193-202, the flat-window mock at
api.spec.ts:127-138, the failing-repo mocks) also uses 1. If a future
refactor accidentally hardcoded `intervalMs = 1000` inside `mapAnalyzeResponse`,
every test in the suite would still pass — the multiplication by 1 is a
no-op. The safety net the spec calls out has no test covering it.

Concrete test: in api.spec.ts, add a `bootFlatApp` variant whose mock repo
returns `intervalSeconds: 60` and prices `[100, 110, 90, 120]` over a
4-tick window starting at `2026-04-22T10:00:00Z`. Expected response: `buy.time`
at `2026-04-22T10:02:00Z` (buyIndex=2 × 60 s offset), `sell.time` at
`2026-04-22T10:03:00Z`. If anyone hardcodes 1 anywhere on the index→time
path the times will be wrong by a factor of 60.

Confidence: MEDIUM — the spec calls this out as a footgun explicitly. Not
HIGH because the current code does read `intervalSeconds` correctly, so the
gap is "future-regression coverage" rather than "current-bug detection."

### 2.4 Cross-bucket throttler isolation is not asserted — LOW

[src/api/api.spec.ts:332-368](src/api/api.spec.ts#L332-L368)

The `@SkipThrottle({ dataset: true })` on `AnalyzeController` and
`@SkipThrottle({ analyze: true })` on `DatasetController` is a non-obvious
configuration — the code review's `2026-04-26` audit specifically calls it
out as a deliberate cross-skipping pattern. If either decorator were
removed, requests to one endpoint would deplete the other's bucket. The
existing 429 test only verifies `/api/analyze` exhausts itself. A test that
hits `/api/dataset` repeatedly with `analyze` configured to a low limit and
then verifies `/api/analyze` still has its full quota would catch a
mistakenly-removed `@SkipThrottle`.

Concrete test: boot with `analyze: limit 3, dataset: limit 120`, send 5
GETs to `/api/dataset` (all 200), then send 3 GETs to `/api/analyze` (all
should be 200). If the cross-skip is removed, the 3rd `/api/analyze` would
return 429 because the 5 dataset hits already consumed the analyze bucket.

Confidence: LOW — the configuration is small and the regression is
a one-decorator-deletion case. Worth a test for the same reason the spec
test at file-price.repository.spec.ts:160-178 anchors on a specific runtime
message: pinning a non-obvious choice that's easy to remove without thinking.

### 2.5 No test for `forbidNonWhitelisted` rejection on extra query params — LOW

[src/api/api.spec.ts](src/api/api.spec.ts) — missing test scenario.

The global `ValidationPipe` is configured with `forbidNonWhitelisted: true`
([api.spec.ts:64-69](src/api/api.spec.ts#L64-L69),
[main.ts](src/main.ts)). If an extra query param is sent (e.g.
`?from=…&to=…&debug=1`), the pipe should reject with `BadRequestException`
which the filter maps to `INVALID_TIMESTAMP`. No test exercises this. If
someone changed the pipe to `forbidNonWhitelisted: false` (or removed the
option), unknown params would silently pass through and the regression
would go unnoticed.

Concrete test: `GET /api/analyze?from=…&to=…&extra=foo`, expect 400 with
`body.code === 'INVALID_TIMESTAMP'`. Today this passes; flipping the pipe
option would turn it green-200 and the test would catch it.

Confidence: LOW — the pipe option doesn't move often, and the contract
impact of accepting extra params is minor. Flagging because the option is
configured deliberately and the test for it is one line.

## 3. Weak tests

None worth flagging individually. The brute-force property test is somewhat
weakened by sharing tiebreaker semantics with the unit under test (covered
in 2.2 above), but it's not WEAK — it does catch profit-value, off-by-one,
boundary-index, and monotonicity-update regressions on 100 random inputs.
The flat-window mock at [api.spec.ts:127-157](src/api/api.spec.ts#L127-L157)
and the failing-repo mocks at [api.spec.ts:243-304](src/api/api.spec.ts#L243-L304)
mock at the right boundary (the repository contract) and assert at the HTTP
shape, so they earn their keep.

## 4. Brittle tests

### 4.1 Wall-clock 100 ms assertion in the complexity test — MEDIUM

[src/analysis/best-trade.spec.ts:148-171](src/analysis/best-trade.spec.ts#L148-L171)

`expect(elapsedMs).toBeLessThan(100)` is the kind of bound that works
locally and on a fresh CI runner and false-fails on a noisy shared runner
under load. The comment claims "~50x headroom over an O(n) scan" — credible
on the host that wrote the comment, but a slow Windows runner under
contention can trivially eat 50 ms on a 23,400-entry scan + JSON load. The
catch-an-O(n²)-regression intent is real (an O(n²) over 23,400 ticks is on
the order of 5 × 10⁸ ops, well past 100 ms even on fast hardware), so the
test isn't wrong — it's right with a thin margin.

Mitigation options: bump to 500 ms (still catches O(n²); 1000× headroom
over O(n)), or move the perf assertion behind a `process.env.CI` flag and
keep the algorithmic-correctness assertions (`buyIndex`, `sellIndex`,
`profit`) unconditionally. The dataset-specific assertions on lines 168-170
are intentional spot-checks and don't need a change — those regenerate
together with the dataset, and the same is true of the api.spec.ts
happy-path assertions on times.

Confidence: MEDIUM — false-fails are plausible; not yet observed but the
margin is tighter than the comment implies on slower hardware.

### 4.2 Boot-time validation tests assert error message text rather than error type — LOW

[src/data/file-price.repository.spec.ts:38-189](src/data/file-price.repository.spec.ts#L38-L189)

Every `onModuleInit()` failure-mode test uses `toThrow(/regex/)` against
fragments of the error message ("intervalSeconds", "prices", "data.json",
"missing.json", "not a finite number"). The repository's `fail()` helper
throws plain `Error`, so message regex is the only way to distinguish which
validation fired — there's no error class hierarchy to assert on. That makes
the regex match the right tool for the job _given the current code_, but it
also means a benign rewording of any of those messages will turn the suite
red. The 1e400 test
([file-price.repository.spec.ts:160-178](src/data/file-price.repository.spec.ts#L160-L178))
has the strongest justification — it explicitly pins the runtime
`Number.isFinite` branch versus the JSON-parse branch — but the others are
weaker on that score.

Not flagging this as a fix-immediately item: the alternative (introducing
distinct error subclasses for each validation failure) is a code change, not
a test change, and the current behaviour is correct. Worth knowing the
brittleness exists if a future PR reworks the messages.

Confidence: LOW — false-fails would be self-inflicted by a message
rewording, not by external factors.

## 5. Overlapping tests

None worth deleting. The two flat-array bestTrade tests
([best-trade.spec.ts:79](src/analysis/best-trade.spec.ts#L79) and
[:110](src/analysis/best-trade.spec.ts#L110)) cover similar ground (zero
profit ≠ trade) but the second is the tiebreaker-block sanity check against
brute-force, so deleting either loses something. The three `/health` checks
across [api.spec.ts:326](src/api/api.spec.ts#L326),
[static.spec.ts:50](src/api/static.spec.ts#L50), and
[test/app.e2e-spec.ts:23](test/app.e2e-spec.ts#L23) each test a different
thing (global-prefix exclusion, route-precedence vs static, full-AppModule
boot smoke); the response assertion is incidentally identical.

## 6. What I looked for and didn't find

- **Tests that would pass against a stubbed-out implementation.** Every
  controller/repository test asserts on a specific response value or
  exception class, not just "did it throw" or "did it return something."
  The bestTrade unit tests assert exact `{ buyIndex, sellIndex, profit }`
  triples; the response-mapper tests run via the integration suite and pin
  the rounded prices and the second-precision time strings.
- **Mocks that mock the unit under test.** The `bootFlatApp` helpers in
  api.spec.ts mock the `PriceRepository` (a layer boundary), not the
  controller, mapper, or filter. Tests reach the real algorithm, real
  filter, real validation pipe.
- **Error-code coverage gaps.** Each of `INVALID_TIMESTAMP`,
  `INVALID_RANGE`, `OUT_OF_BOUNDS`, `DATA_UNAVAILABLE`, `INTERNAL_ERROR`
  has at least one test that triggers it via the HTTP path, not by
  instantiating the exception class directly. `INTERNAL_ERROR`
  additionally asserts that the original exception's message and stack
  don't leak into the response body — exactly the kind of thing this code
  is supposed to do.
- **Boundary inclusivity at the data layer.** The "from = startTime, to =
  last tick", "from = to single tick", and "boundary endpoints included"
  tests at file-price.repository.spec.ts:204-260 directly cover the
  inclusive-on-both-ends contract.
- **Static asset / API route precedence.** `static.spec.ts` boots the real
  `AppModule` with `useStaticAssets`, exercising the production-shaped
  middleware order. The `/api/dataset` and `/health` routes are verified
  to reach controllers (not the static module), which is the failure mode
  the brief calls out.
- **Empty / single-element / all-equal arrays in `bestTrade`.** All three
  are unit-tested.
- **Property-test sample size.** 100 random arrays of length 20 across
  values [0,50]. Big enough to surface off-by-one and boundary errors;
  small enough to run in a few hundred ms.
- **CSP / Helmet / `trust proxy` behaviour.** Configured in
  [main.ts](src/main.ts), not exercised by the integration tests, but
  these are bootstrap/middleware concerns that aren't normally unit-tested
  and the brief doesn't call them out as test targets.
- **Snapshot tests.** None present (the brief said to skip critique here).
