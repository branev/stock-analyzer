# Phase 5 — Frontend and Security

> **Status:** Complete — commit `ac173b7` (`feat: add static frontend, Helmet CSP, and same-origin serving`).

Local contract for Phase 5. Companion to the authoritative roadmap in `docs/03-implementation-plan.md`; this document is the per-phase scope agreement.

## Goal

Add the static frontend and the security middleware. Same-origin serving via NestJS, no build step, two committed vendor files (Alpine.js + Pico CSS) pinned to specific versions, Helmet with a CSP tuned for those two libraries. No new endpoints — the frontend is purely a consumer of the Phase 4 API.

## Deliverables

1. **`public/index.html`** — single static page; header, two date pickers, optional funds input, analyse button, result area with "Show math" toggle, inline error display.
2. **`public/app.js`** — single small Alpine.js component handling fetch on init, picker bounds, in-flight state, result rendering, error rendering, and client-side funds calculation.
3. **`public/vendor/alpine-<version>.min.js`** — pinned Alpine.js v3.x (specific version named in the filename), downloaded once and committed.
4. **`public/vendor/pico-<version>.min.css`** — pinned Pico CSS v2.x, same pattern.
5. **`@nestjs/serve-static`** wired into `AppModule` to serve `public/` at `/`. Configured not to capture `/api/*` or `/health`.
6. **Helmet middleware** with a CSP that allows Pico's inline styles and Alpine loaded as a local script.
7. **One integration test** asserting the static module and the API coexist correctly.

## Page contents (per the brief)

- **Header.** Ticker name and coverage period rendered from `GET /api/dataset` on page load. Format: `"ACME — Apr 22, 2026, 09:30 → 15:59:59 UTC"` or similar.
- **Two `<input type="datetime-local">` pickers** — `from` and `to`. `min` and `max` set from the dataset's coverage. `value` left empty so the user must pick.
- **Optional funds input** — `<input type="number" min="0">`, no `required`. If empty, the result omits the share-count sentence.
- **Analyse button** — disabled when (a) either date is not valid, or (b) `from >= to`, or (c) a request is in flight.
- **Result area** — empty initially. After a successful response with a profitable trade:

  > Buy at **2026-04-22 09:30:13 UTC** for **$107.89**, sell at **2026-04-22 11:39:22 UTC** for **$129.43**, profit **$21.54** per share. With **$1,000** you could have bought **9 shares** for **$193.86** total profit.

  The funds-derived sentence is omitted if funds is empty.

- **"Show math" toggle** — collapsible details revealing the calculation: per-share profit, `floor(funds / buyPrice)` share count, total profit.
- **Inline error display** — when the API returns an error envelope, render the `message` near the analyse button. No toasts, no modals.
- **Null result** — when the API returns `buy`/`sell`/`profitPerShare` all `null`, render `"No profitable trade in this window."` instead of the sentence above.

## Funds calculation (client-side)

The server doesn't know about funds. The client computes:

```
shares          = Math.floor(funds / buyPrice)
totalProfit     = shares * profitPerShare
```

Per the brief, this calculation lives entirely in the browser. `profitPerShare` comes from the API response.

## Datetime picker — minute UI, second API

`<input type="datetime-local">` gives minute precision in the browser UI (the natural granularity for human selection). The form converts to second-precision ISO 8601 with a `Z` suffix before sending to the API:

```
2026-04-22T09:30      // browser value
→ 2026-04-22T09:30:00Z  // sent to /api/analyze
```

A comment in `app.js` explains this minute-UI / second-API distinction so a future reader doesn't conclude one of them is wrong.

## Pinned vendor files

Same pinning rule as npm dependencies: download once, commit, name the version in the filename, never use `latest` or a CDN. Note that `min-release-age=7` in `.npmrc` is an **npm-install** gate; it does not apply to manually downloaded files committed to the repo, so we don't artificially defer the pin.

- **Alpine.js — v3.14.x** (the minor is the contract; pick the latest patch at download time). File: `public/vendor/alpine-3.14.<patch>.min.js`. Loaded with `<script defer src="vendor/alpine-3.14.<patch>.min.js"></script>` in `index.html`.
- **Pico CSS — v2.0.x** (same convention). File: `public/vendor/pico-2.0.<patch>.min.css`. Loaded via `<link rel="stylesheet" href="vendor/pico-2.0.<patch>.min.css">`.

Upgrading the minor is a deliberate commit that bumps the filename. Patch upgrades within the same minor follow the same procedure but don't require re-discussion. CDNs and `latest` are forbidden — they'd let third-party hosting changes silently affect the deployed app.

## Same-origin static serving

`ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public'), serveRoot: '/' })`. Same origin as the API: no CORS preflight, no `Access-Control-Allow-Origin` headaches.

The module must NOT capture `/api/*` or `/health` — those routes belong to the existing controllers. NestJS ServeStaticModule passes through unmatched routes to controllers when configured correctly, but route-order subtleties have bitten projects before. The integration test below asserts this explicitly.

## Helmet + CSP

Helmet with default headers, CSP tuned for our two vendor libraries:

- **`style-src 'self' 'unsafe-inline'`** — Pico applies inline `style` attributes to form elements (specifically range/color inputs and a few others). Without `'unsafe-inline'`, those styles are blocked. The carve-out is necessary; we accept the looser policy because the value of Pico (semantic styling, no class gymnastics) outweighs the marginal hardening of strict `style-src`.
- **`script-src 'self' 'unsafe-eval'`** — Alpine.js v3 evaluates its `x-*` directive expressions via `new Function(...)` at runtime, which CSP treats as `eval`. Without `'unsafe-eval'`, every directive throws and the page renders only the initial "Loading…" placeholders. Alpine ships a CSP-friendly build (`cdn.csp.min.js`) that avoids `eval` but only supports property-access expressions — our `x-text="formatCurrency(state.result.buy.price)"` patterns aren't compatible. We accept the looser policy as the cost of Alpine's expressive style. No `'unsafe-inline'` for scripts: Alpine loads as an external file from `public/vendor/`, so script tags themselves stay strict.
- All other CSP directives left at Helmet's defaults: `default-src 'self'`, `img-src 'self' data:`, `connect-src 'self'`, etc.

**CSP must be verified in a real browser**, not just by tests. A test pass and a deployed page that fails to render are different states. The Phase 5 manual verification (and Phase 6's deploy verification) include opening the page in a browser and confirming:

1. No CSP violations in DevTools console.
2. Pico styling is visible (form elements look themed, not raw OS controls).
3. Alpine initialises (the analyse button enables/disables correctly, the result area updates after submit).

## In scope

- The four committed assets in `public/` (HTML, app.js, vendor JS, vendor CSS).
- `ServeStaticModule` wiring with the API/health carve-outs.
- Helmet middleware with the CSP described above.
- One integration test covering the static-vs-API route precedence.
- Manual browser verification (recorded in tasks.md as a discrete step).

## Out of scope (deferred to later phases)

- Railway deployment + the live-page CSP verification — Phase 6.
- README, Postman collection, deployed-URL note — Phase 7.
- Any new API endpoints — there are none. Phase 4 shipped the full API surface.
- Hot reload of frontend assets in dev — `nest start --watch` already restarts on file change; no separate frontend watcher needed.
- A small price chart of the selected window — listed in the brief as an optional "if time permits" addition; not built unless explicitly approved.

## TDD scope

Per CLAUDE.md:

- **Test-after** for the static-serving integration test (controllers, DTOs, frontend, mock-data generator are all test-after).
- The frontend itself (HTML + Alpine logic) is **not unit-tested** — see "Out of test scope" below.

## Out of test scope

Tests validate our code's contract, not third-party behaviour or internal state. Explicitly **not** tested in Phase 5:

- **Browser DOM behaviour.** No Jest DOM assertions, no Cypress, no Playwright, no jsdom-driven Alpine simulation. The page is small enough that manual verification (open it, click through the flow) is proportionate to the take-home's value. Bringing in a browser-test framework would multiply the dependency surface and CI runtime for a single static page.
- **`@nestjs/serve-static` correctness.** The library is assumed to serve files from a directory. Our integration test exercises the WIRING (does `/` return our index, does `/api/dataset` still hit the controller) — not the library's file-serving behaviour.
- **Helmet's correctness.** The library is assumed to set the headers we configure. Our manual browser check confirms the CSP didn't break the page; we don't assert on the exact header values in unit tests.
- **Alpine.js or Pico CSS correctness.** Both are pinned third-party libraries; we trust them.
- **Visual regression.** No screenshot diffs, no pixel comparisons. The brief calls for "minimal Pico defaults"; visual polish isn't graded.
- **The CSP itself in unit tests.** A browser is the only way to know the CSP works for real. A unit test asserting "header X equals Y" would test Helmet's emit, not whether the page actually renders.
- **Performance of the static module.** Out of scope.

The reasoning: the Phase 5 surface is intentionally thin. Unit-testing static HTML or DOM scripts adds machinery (jsdom, fake-indexeddb, etc.) that costs more than it saves for a single page. We trade the unit-test net for explicit manual verification, recorded as a discrete task in `tasks.md`.

## Required tests

### Static / API route precedence (one integration test)

`Test.createTestingModule` with `AppModule`. Three assertions in one or three closely-related `it(...)` blocks:

- `GET /` returns the index page (HTML, status 200, content-type `text/html`).
- `GET /api/dataset` returns the JSON envelope from the controller (status 200, content-type `application/json`).
- `GET /health` returns `{ status: 'ok' }` (still reachable on the unprefixed path).

The single discriminating bug each test catches: the static module is mis-configured to capture `/api/*` or `/health`, returning the index page where the API should respond.

### Manual browser verification (recorded in tasks.md, not codified)

Discrete checklist in tasks.md, executed once before commit:

1. Page renders with Pico styling visible.
2. Header populated from `GET /api/dataset`.
3. Date pickers have correct `min`/`max` constraints.
4. Analyse button disabled until both dates are valid.
5. Submit a profitable window; result sentence renders with rounded prices.
6. Submit a sub-window with no profitable trade; "No profitable trade" message renders.
7. Submit an invalid range; inline error message renders with the API's `message`.
8. Toggle "Show math"; calculation rows appear/disappear.
9. Enter funds; share-count sentence appears with `floor(funds / buyPrice) × profitPerShare` correctly computed.
10. DevTools console has no CSP violations.

## Success criteria

- All committed assets present at the pinned versions.
- The integration test asserts route precedence (`/`, `/api/dataset`, `/health`).
- Manual verification checklist all pass.
- `npm run lint` clean; `npm run typecheck` clean; `npm test` all green; `npm run build` clean; `npm audit --audit-level=high` clean.
- Phase 5 lands as a single atomic commit. Suggested message (final wording in tasks.md): `feat: add static frontend, Helmet CSP, and same-origin serving`.

## Dependencies on prior phases

- **Phase 0 (CLAUDE.md):** atomic commits, AAA, no `--no-verify`, dependency pinning rule (now extended to vendor JS/CSS).
- **Phase 1 (scaffold):** ESLint, Prettier, Husky, CI active.
- **Phase 4 (API):** all three endpoints (`/api/dataset`, `/api/analyze`, `/health`) consumed by the frontend.

## Risks

- **CSP breaks the page after deploy.** A test pass and a working browser are different states. Mitigated by: (a) explicit `'unsafe-inline'` for `style-src` to accommodate Pico, (b) manual browser check as a discrete task, (c) Phase 6 deploy verification re-runs the same check on the live URL.
- **`ServeStaticModule` captures `/api/*`.** Common when `serveRoot` and route order are misconfigured. Mitigated by the integration test that hits `/api/dataset` and confirms JSON, not HTML.
- **`__dirname` resolution under Nest's compiled output.** Path of `public/` differs between `npm run start` (ts-node) and `npm run build` then `node dist/main`. The build copies static assets via `nest-cli.json`'s `assets` config; if that's missing, the deployed bundle has no `public/` directory. Tasks.md includes an explicit step to verify `dist/` after `npm run build` contains `public/`.
- **Vendor file size.** Pico is ~80 KB minified; Alpine is ~40 KB minified. Both small enough for committed files. If either grows materially in a future version, the size deserves review at upgrade time, not now.
- **Browser timezone confusion.** `datetime-local` returns local time; we convert to UTC `Z`-suffix before sending. If the user's browser is in a non-UTC zone and they pick "09:30," they'll send `09:30 UTC` (their picker shows `09:30` local but the conversion logic interprets it as the picker's literal value plus `Z`). The brief's UTC-only convention says this is fine — picker labels and API timestamps both display UTC; we're consistent. A comment in `app.js` documents this.
