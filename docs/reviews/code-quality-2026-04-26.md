# Code quality review — 2026-04-26

Scope: `src/` (NestJS backend), `public/` (Alpine.js frontend), and the
inter-module dependency graph. Tests, docs, and config files are out of scope.

## 1. Summary

Overall, the code is in good shape for its size. The dependency graph is clean
and unidirectional (`api → analysis`, `api → data`, `data → config`; nothing
loops or skips a layer), TypeScript is strict, error handling has clear
boundaries, and the frontend is small and self-contained. The only genuine bug
I found is a regex-vs.-`Date`-parser mismatch in the analyze input path that
causes a misleading error code on malformed-but-pattern-matching timestamps.
The most surprising thing was how much of the codebase is well-justified: most
non-obvious choices (CSP loosening, `trust proxy 1`, the throttler
cross-skipping pattern, the `cwd()`-based static path) carry inline rationale
that holds up under scrutiny. There are two structural items worth tightening
(duplicated ISO formatting, partial dataset-file validation), nothing else
significant.

## 2. Bugs

### 2.1 Invalid-but-pattern-matching timestamps surface as `OUT_OF_BOUNDS` instead of `INVALID_TIMESTAMP` — HIGH

[src/api/dto/analyze.dto.ts:3](src/api/dto/analyze.dto.ts#L3),
[src/api/analyze.controller.ts:17-22](src/api/analyze.controller.ts#L17-L22),
[src/data/file-price.repository.ts:60-80](src/data/file-price.repository.ts#L60-L80)

The DTO regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` accepts strings that
are syntactically well-formed but not real dates — `2026-13-01T00:00:00Z`,
`2026-02-30T00:00:00Z`, etc. `new Date('2026-13-01T00:00:00Z').getTime()`
returns `NaN` (verified on Node 22). The controller's
`from.getTime() >= to.getTime()` comparison is `NaN >= …` which is always
`false`, so the `InvalidRangeError` guard does nothing. The request then
reaches `getPriceSeries`, where every numeric comparison against `NaN` returns
`false`, so the bounds branch is skipped, and the alignment check
`fromOffsetMs % intervalMs !== 0` evaluates as `NaN !== 0 → true`, raising
`OutOfBoundsError("Window [Invalid Date, …] is misaligned to the tick grid …")`.
The client receives a 400 with `code: "OUT_OF_BOUNDS"` and a nonsense window
in the message — not the documented `INVALID_TIMESTAMP` response shape that
the exception filter is otherwise wired to emit. This matters because
`OUT_OF_BOUNDS` and `INVALID_TIMESTAMP` are distinct contract codes that the
frontend branches on (`displayedError` appends the available range only for
`OUT_OF_BOUNDS`), so a malformed input is misclassified at the API contract
level, not just stylistically.

Fix: validate the date is real, not just regex-shaped. Cheapest fix is to
check in the controller right after construction:
`if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new InvalidTimestampError();`
(adding `InvalidTimestampError` to `errors.ts` and mapping it in the filter
the same way `InvalidRangeError` is mapped, with code `INVALID_TIMESTAMP`).
Alternatively, swap `@Matches(...)` for `@IsISO8601({ strict: true })` plus a
post-validation re-check, but the regex-then-explicit-NaN-check route is the
smaller change and keeps the second-precision constraint enforced.

Confidence: HIGH — verified the path with a Node REPL (`new Date('2026-13-01T00:00:00Z').getTime()` returns `NaN`).

## 3. Design findings

### 3.1 Partial validation of the data file — MEDIUM

[src/data/file-price.repository.ts:27-54](src/data/file-price.repository.ts#L27-L54)

`onModuleInit` validates `intervalSeconds` and `prices` thoroughly but
unsafely casts `symbol`, `name`, `currency`, and `startTime` straight from
`Record<string, unknown>` without assertions. If `startTime` is missing or a
non-string, `new Date(parsed.startTime as string).getTime()` returns `NaN`,
the loaded state silently holds NaN times, and every subsequent
`getPriceSeries` call surfaces the same misleading "misaligned to the tick
grid" error as bug 2.1 — except now it's permanent for the lifetime of the
process. The validation pattern is asymmetric: for the two fields that are
checked, malformed input fails fast at startup with a clear message; for the
others, malformed input fails late with a confusing message. This is worse
than no validation, because the partial validation suggests the file is
trusted post-init when in fact it isn't.

Fix: add `assertValidString(value, fieldName)` and
`assertValidStartTime(value)` (the latter checks `typeof === 'string'` and
that `Date.parse(value)` is finite), call them in `onModuleInit` alongside
the existing asserts, and use TypeScript's `asserts value is string` return
type so the subsequent `as string` casts go away. Keeps the fail-fast-at-boot
contract consistent across all dataset fields.

Confidence: MEDIUM — the bad-startTime path is reachable via a hand-edited
data file but not via normal use; the fix is a straightforward extension of
the existing pattern.

### 3.2 ISO millisecond stripping is duplicated across files — MEDIUM

[src/api/dataset.controller.ts:26-27](src/api/dataset.controller.ts#L26-L27),
[src/api/response-mapper.ts:27-28](src/api/response-mapper.ts#L27-L28),
[src/api/response-mapper.ts:42](src/api/response-mapper.ts#L42),
[src/api/response-mapper.ts:46](src/api/response-mapper.ts#L46)

The exact regex `/\.\d{3}Z$/` and the `'Z'` replacement appear six times
across two files. This is the spec's response-shape rule (second-precision
ISO 8601 UTC, no milliseconds) and the docs name it as a contract concern.
With six copies, a future change to the timestamp format — e.g. switching to
millisecond precision, or to a different timezone marker — has to be applied
in six places, and a partial application would silently produce a hybrid
response. The CLAUDE.md "three similar lines beats a premature abstraction"
rule applies up to three; six is past that line.

Fix: add one exported function in `response-mapper.ts` (e.g.
`toSecondPrecisionUtc(date: Date): string`) and call it from both controllers
and the mapper itself. No new file, no new module — just a single helper next
to the existing `roundCurrency`, which is the codebase's established pattern
for response-shaping helpers.

Confidence: MEDIUM — this is a judgment call on the project's tolerance for
duplication, but six copies of the same regex tied to a contract field is
past the threshold.

### 3.3 API layer imports a data-layer error class — LOW

[src/api/exception-filter.ts:11](src/api/exception-filter.ts#L11)

`AllExceptionsFilter` imports `OutOfBoundsError` from
`../data/price.repository`. The error type is declared next to the abstract
repository it relates to, but the API layer is the only place it's mapped to
an HTTP response. The dependency direction (`api → data`) is consistent with
the rest of the graph, so this isn't a cycle, but it does mean the API's
exception envelope is structurally aware of an internal data-layer error
class. If the data layer grew a second backend (e.g. a remote-API repository),
each new repository's error types would also need to be plumbed through to
this filter.

Fix: move `OutOfBoundsError` to `src/api/errors.ts` alongside
`InvalidRangeError` and `DataUnavailableError`, then have the repository
import it from there. The error is part of the API contract (the spec defines
`OUT_OF_BOUNDS` as a response code), so colocating it with the other contract
errors matches its actual role. Repositories importing from
`api/errors.ts` is a mild reverse-direction dependency, but since the API
errors are part of the spec the data layer is implementing, that direction
is defensible — and is shorter than introducing a third "shared/errors"
location.

Confidence: LOW — defensible either way; flagging because the import jumped
out as the only `api → data` import that wasn't a repository reference.

### 3.4 `BadRequestException` mapping hardcodes a single DTO's message — LOW

[src/api/exception-filter.ts:56-65](src/api/exception-filter.ts#L56-L65)

The catch-all for `BadRequestException` returns a fixed message
("from and to must be ISO 8601 UTC timestamps with second precision …") and
code `INVALID_TIMESTAMP`. Right now this is fine because `AnalyzeDto` is the
only DTO and its only failure modes are the regex/non-empty/string checks.
But the mapping is silently coupled to that fact: any second DTO added in
the future (e.g. a POST body, a different query DTO) would inherit the
"from and to" message regardless of which fields actually failed validation.
This is a latent footgun more than a current bug.

Fix: read `exception.getResponse()` (which contains an array of validation
messages from `class-validator`) and pass through the first message instead
of hardcoding. Keep the `INVALID_TIMESTAMP` code only when the failed field
matches `from`/`to`; for other fields, use a generic `INVALID_INPUT` code.
If the brief specifies the exact response shape for the only DTO, document
that constraint in a comment so a future addition doesn't quietly inherit
the wrong message.

Confidence: LOW — the current behaviour is correct given the current DTO
set; this is a "fragile under change" finding, not a "broken now" finding.

## 4. Polish

- [src/data/file-price.repository.ts:35-37](src/data/file-price.repository.ts#L35-L37): The trio of `as number` / `as readonly number[]` / `as string` casts after the validation calls would disappear if the asserts used TypeScript's `asserts value is T` return type, narrowing `parsed`'s field types directly.
- [src/api/dataset.controller.ts:5-12](src/api/dataset.controller.ts#L5-L12): `DatasetResponse` is declared inline; `AnalyzeResponse` is exported from `response-mapper.ts`. Either both response types live with their controller, or both live with the mapper — the inconsistency is the only thing worth flagging.
- [public/app.js:42](public/app.js#L42), [public/app.js:173](public/app.js#L173): `err?.message ?? 'fallback'` is fine but `err instanceof Error ? err.message : 'fallback'` is what the backend uses — small consistency miss between the two halves of the codebase.
- [src/api/exception-filter.ts:62](src/api/exception-filter.ts#L62): The hardcoded message uses a Java-style date format token (`yyyy-MM-ddTHH:mm:ssZ`) but the rest of the project (DTO regex, frontend comments) talks in terms of `YYYY-MM-DDTHH:MM:SSZ`. Pick one casing convention.

## 5. What I looked for and didn't find

- **XSS / unsafe HTML interpolation in the frontend.** All Alpine bindings use `x-text` (escaped) or `x-show` (boolean). No `x-html`. The dataset name is rendered via `x-text` in the eyebrow line, so even a hostile `name` field can't break out.
- **Path traversal in the data file path.** `DATA_FILE_PATH` is read from validated env, never from user input; `fs.existsSync` and `fs.readFileSync` get the raw value. No request reaches the filesystem layer.
- **Race conditions in `analyse()` / double-submit.** The Analyse button is disabled via `:disabled="!canAnalyse"` and `canAnalyse` checks `state.loading`, so the user can't fire a second request while one is in-flight. No need for `AbortController`.
- **Off-by-one in slice / index math.** `prices.slice(fromIdx, toIdx + 1)` is correct for an inclusive end; `bestTrade` indices are within the sliced array, and `mapAnalyzeResponse` adds `buyIndex * intervalMs` to `windowFrom` (which is the slice's start), so the times line up. `intervalSeconds` is read from the dataset every call, not hardcoded — the CLAUDE.md spec safety net holds.
- **Throttler bucket coverage.** Each controller skips the throttler buckets that aren't its own; the named-bucket pattern means `HealthController` skips both and is unthrottled (intentional for `/health`), `AnalyzeController` is rate-limited to 60/min, `DatasetController` to 120/min. No double-counting, no controller falling through to a default bucket.
- **CSP correctness for Alpine + Pico.** The CSP comment in `main.ts` accurately explains why `script-src 'unsafe-eval'` and `style-src 'unsafe-inline'` are needed; the frontend's `x-text="formatCurrency(...)"` calls do require `new Function()` evaluation, so the cdn.csp Alpine build wouldn't work. The trade-off is documented and correct.
- **Dependency graph shape.** `api/*` depends on `analysis/*`, `data/*`, and `config/*`; `data/*` depends only on `config/*`; `analysis/*` is pure; `config/*` is leaf. No cycles, no skip-level imports, no controller reaching into another controller. Module boundaries are clean.
- **Floating-point precision in profit math.** `roundCurrency` uses `Math.round(x * 100) / 100`, which is the project's documented rounding rule (CLAUDE.md mentions the "never `toFixed`" rule applies to API serialisation). `bestTrade` computes `price - minPrice` once per iteration in a hot loop without accumulation, so float drift is bounded to a single subtraction.
- **`trust proxy` correctness.** `app.set('trust proxy', 1)` allows exactly one proxy hop, which is right for a single Railway/PaaS edge in front of the app. Setting it higher would let clients spoof `X-Forwarded-For`; setting it lower (or omitting it) would collapse per-IP throttling onto the proxy's loopback address. The single-hop value is correct.
- **`process.cwd()` static-asset path under tests.** The comment in `main.ts` flags this as deliberate; the `static.spec.ts` file in the codebase suggests the choice is exercised by tests.
- **Frontend dataset bounds in `init()` failure mode.** If `/api/dataset` fails, `form.minLocal`/`form.maxLocal` stay empty, both date inputs have empty `:min`/`:max`, and `canAnalyse` returns `false` because `form.from`/`form.to` are also empty. The error is shown and the form is correctly inert.
