# Phase 5 — Tasks

Sequential execution checklist. Work top-to-bottom. Do not skip ahead. Each task should leave the working tree in a state where lint, typecheck, and test still pass.

Conventions:

- `[ ]` pending, `[x]` done.
- This phase is **test-after** per CLAUDE.md. Build the frontend + middleware first; the integration test comes at the end.
- Each task is small enough that a junior engineer could pick it up without further context.

---

## Section A — Dependencies and pinned vendor assets

- [x] **A1.** Install `@nestjs/serve-static` and `helmet` with `--save-exact`. Confirm both appear in `package.json` with no caret prefixes.
- [x] **A2.** Pick the latest patch within **Alpine v3.14.x** and **Pico v2.0.x** at download time. **Locked: Alpine = 3.14.9, Pico = 2.0.6** (latest patches available at the time of writing, confirmed via `npm view`).
- [x] **A3.** Create `public/vendor/` directory. Download Alpine.js minified to `public/vendor/alpine-3.14.9.min.js`. Download Pico CSS minified to `public/vendor/pico-2.0.6.min.css`. Both files committed; never re-fetched from a CDN at runtime.
- [x] **A4.** Sanity-check both vendor files: open them locally, confirm the version string matches the filename (Pico has a banner comment with version; Alpine has its version in the file header).

---

## Section B — Static page

- [x] **B1.** Create `public/index.html` with the Pico stylesheet link, the Alpine script tag (with `defer`), and an Alpine root element wrapping all interactive content. UTF-8 charset, viewport meta, sensible `<title>`. Use semantic HTML (`<header>`, `<main>`, `<section>`).
- [x] **B2.** Add the header section: ticker name and coverage period, both bound to Alpine state (`x-text="header.title"` / `x-text="header.coverage"`). Defaults are placeholders ("Loading…") shown before the dataset fetch resolves.
- [x] **B3.** Add the two `<input type="datetime-local">` pickers: `from` and `to`. Bind to `form.from` / `form.to`. Set `min` and `max` via `x-bind` from dataset state. Leave `value` empty.
- [x] **B4.** Add the optional funds input: `<input type="number" min="0" step="any">`. Bind to `form.funds`. No `required` attribute.
- [x] **B5.** Add the analyse button. `:disabled="!canAnalyse"` where `canAnalyse` is true only when both dates are set, `from < to`, and no request is in flight.
- [x] **B6.** Add the result section: shows nothing until a query has resolved. Bound to Alpine state for the success sentence, the error message, and the null-result message. The "Show math" `<details>` toggle goes inside the result block, hidden when there's no profitable trade.
- [x] **B7.** Add the inline error region (next to the analyse button), bound to `state.error`.

---

## Section C — Alpine logic (`public/app.js`)

- [x] **C1.** Single Alpine `data` component exposing: `header`, `form` (`from`, `to`, `funds`), `state` (`loading`, `result`, `error`), `dataset` (the metadata fetch result).
- [x] **C2.** `init()` async function: fetch `GET /api/dataset`, populate `dataset.from`/`dataset.to`/`header.title`/`header.coverage`, set picker `min`/`max`. On error: set `state.error` to a friendly message and disable the form.
- [x] **C3.** `canAnalyse` getter: returns `true` iff `form.from && form.to && new Date(form.from) < new Date(form.to) && !state.loading`.
- [x] **C4.** `analyse()` async function: set `state.loading = true`; convert `form.from`/`form.to` from `<datetime-local>` minute-precision to second-precision UTC ISO 8601 with `Z` suffix (add a comment explaining the minute-UI / second-API distinction); fetch `GET /api/analyze?from=…&to=…`. On 200, populate `state.result`; on non-2xx, parse the error envelope and populate `state.error`. Always clear the other state field. Always set `state.loading = false` in a `finally`.
- [x] **C5.** Funds calculation helper: `sharesAffordable(funds, buyPrice) = Math.floor(funds / buyPrice)`; `totalProfit(funds, buyPrice, profitPerShare) = sharesAffordable(funds, buyPrice) * profitPerShare`. Pure functions, called only when funds is a positive number AND a profitable trade exists.
- [x] **C6.** Result rendering: a single getter `resultSentence` returning the human-readable sentence using current `state.result`, with the funds-derived clause appended only when funds is a positive number.
- [x] **C7.** Null-result rendering: when `state.result.buy === null`, the sentence is replaced with `"No profitable trade in this window."`.
- [x] **C8.** Error rendering: `state.error` is the `message` field from the API envelope. Cleared at the start of every analyse() call.

---

## Section D — Server wiring

- [x] **D1.** Add `ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public'), serveRoot: '/', exclude: ['/api/(.*)', '/health'] })` (or the v6+ `excludeFromGlobalPrefix` equivalent — check the version). Goal: `/` serves the index page; `/api/*` and `/health` continue to hit controllers.
- [x] **D2.** Verify `nest-cli.json` has `assets` configured to copy `public/` into `dist/` on build. If missing, add it.
- [x] **D3.** Run `npm run build`. Confirm `dist/public/` exists and contains `index.html`, `app.js`, and the two `vendor/` files.

---

## Section E — Helmet + CSP

- [x] **E1.** Add `helmet` middleware in `src/main.ts` via `app.use(helmet())`. Verify Helmet's defaults are applied (use `curl -I http://localhost:3000/` to confirm `Content-Security-Policy` and other headers are present).
- [x] **E2.** Tune the CSP via the helmet options:

  ```ts
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'style-src': ["'self'", "'unsafe-inline'"],
          'script-src': ["'self'"],
        },
      },
    }),
  );
  ```

  No `'unsafe-eval'`, no `'unsafe-inline'` for scripts. The carve-out is only `style-src`.

- [x] **E3.** Local browser smoke (BEFORE the integration test): `npm run start:dev`, open `http://localhost:3000` in a real browser, confirm Pico styling renders and DevTools console shows no CSP violations. If a violation appears, FIX THE CSP, do not work around it. (Common fix: a Pico inline-style on a form element needs `'unsafe-inline'`, which we already have.)

---

## Section F — Integration test (route precedence)

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

Use `Test.createTestingModule` with `AppModule`. Apply the same global pipe/filter/prefix configuration as the existing `api.spec.ts` (consider extracting a `bootApp` helper if the duplication is meaningful — judgement call; default to inlining the setup for one new test).

- [x] **F1.** Create `src/api/static.spec.ts` (alongside `api.spec.ts`).
- [x] **F2.** Test: `GET /` returns 200 with `content-type` containing `text/html` and a body containing the page's `<title>` text. Catches: ServeStaticModule mis-configured.
- [x] **F3.** Test: `GET /api/dataset` returns 200 with `content-type` containing `application/json` and a body with `symbol: 'ACME'`. Catches: ServeStaticModule capturing `/api/*` and serving the index page where the controller should respond.
- [x] **F4.** Test: `GET /health` returns 200 with `{ status: 'ok' }`. Catches: ServeStaticModule capturing `/health`.

---

## Section G — Manual browser verification (mandatory before commit)

> Recorded here as a discrete task because there is no automated browser test in this phase. If any item fails, fix it before commit.

- [x] **G1.** Run `npm run start:dev`. Open `http://localhost:3000` in a real browser.
- [x] **G2.** Header populated: ticker name = "ACME — Acme Corporation"; coverage period reads from `dataset.from`/`dataset.to`.
- [x] **G3.** Date pickers: `min` and `max` constrain selection to the dataset's coverage. Empty by default.
- [x] **G4.** Analyse button disabled until both pickers have valid values and `from < to`.
- [x] **G5.** Submit a profitable window (e.g. full day). Result sentence renders with rounded prices and ISO timestamps.
- [x] **G6.** Toggle "Show math". Calculation rows appear and disappear.
- [x] **G7.** Enter funds (e.g. `1000`). Share-count sentence appears with `floor(funds / buyPrice)` and total profit.
- [x] **G8.** Submit an invalid range (e.g. `from === to` after temporarily disabling the disable). Inline error renders with the API's message.
- [x] **G9.** Submit a sub-window with no profitable trade (use a small flat portion of lunch lull, or temporarily mock the API). The "No profitable trade" message renders.
- [x] **G10.** DevTools console: zero CSP violations across all the above flows. Network tab: `/api/dataset` and `/api/analyze` requests are 200; static assets (Alpine, Pico, app.js, index.html) all load without CSP errors.
- [x] **G11.** **Built-version smoke (mandatory).** Stop `start:dev`. Run `npm run build && node dist/main.js`. Re-execute G2, G5, and G10 against the built server. The point is to catch the case where `dev` works but `dist/public/` is empty or mis-located — Railway runs the built server, so a dev-only pass doesn't prove the deployed page will render. If anything fails here that passed in dev, fix `nest-cli.json`'s `assets` config (D2) and rebuild before continuing.

---

## Section H — Verify and commit

- [x] **H0.** **Test self-review step.** Walk through the static-serving integration spec's `it(...)` blocks. For each, articulate two sentences:
  1. _"If this test fails, what bug in our code has been introduced?"_
  2. _"Which code path does this test actually exercise?"_

  Apply two rules:
  - If the answer to (1) involves a third-party library (`@nestjs/serve-static`, Helmet, Alpine, Pico, Express's content-type middleware), or an implementation detail that doesn't affect the public contract — delete the test.
  - If two tests appear to test different things but exercise the same code path, one is redundant — keep only the test that traverses the unique path.

  List the articulations and any deletions in the final report at H9.

- [x] **H1.** Run `npm run lint`. Must be clean.
- [x] **H2.** Run `npm run typecheck`. Must be clean.
- [x] **H3.** Run `npm test`. Must be all green. The new spec file `src/api/static.spec.ts` must show in the suite list. Existing Phase 1–4 tests must still pass.
- [x] **H4.** Run `npm run test:e2e`. Must pass. (The e2e test still hits `/health`; it should still return 200 through the now-richer middleware stack.)
- [x] **H5.** Run `npm run build`. Must be clean. Confirm `dist/public/` is populated (D3).
- [x] **H6.** Run `npm audit --audit-level=high`. Must report zero vulnerabilities at this level.
- [x] **H7.** `git status` review:
  - Confirm `public/` (with `index.html`, `app.js`, and `vendor/` containing the two pinned files) is staged.
  - Confirm `src/api/static.spec.ts` is staged.
  - Confirm `src/main.ts` and `src/app.module.ts` modifications are staged.
  - Confirm Phase 4 retroactive cleanup (status header on `04-api/requirements.md`, I8/I9/I10 ticks on `04-api/tasks.md`) is staged with this commit.
  - Confirm no stray test files left on disk.
- [x] **H8.** Stage explicitly (no `git add .`):
  - `public/` (entire directory).
  - `src/api/static.spec.ts`.
  - `src/main.ts` and `src/app.module.ts` (modified).
  - `package.json` and `package-lock.json` (modified for `@nestjs/serve-static` + `helmet`).
  - `nest-cli.json` if the `assets` config was added (D2).
  - `docs/phases/04-api/requirements.md` and `docs/phases/04-api/tasks.md` (Phase 4 retroactive cleanup).
  - `docs/phases/05-frontend-and-security/requirements.md` and `docs/phases/05-frontend-and-security/tasks.md`.
- [x] **H9.** Commit with message exactly: `feat: add static frontend, Helmet CSP, and same-origin serving`. Include a body that lists the four committed assets (HTML, app.js, Alpine, Pico with versions), the CSP carve-outs (`style-src 'self' 'unsafe-inline'`, `script-src 'self'`), the route-precedence rule, and a note that the manual browser verification (Section G) was completed. Mention the Phase 4 retroactive cleanup folded in. Report the H0 articulations and any deletions.
- [x] **H10.** Confirm the pre-commit hook ran (lint-staged + typecheck) and the commit landed. Show `git log --oneline -3` and `git status`. Update the Phase 5 status header in `requirements.md` to `Complete — commit <hash>`. Retroactively flip H7/H8/H9/H10 to `[x]` per the CLAUDE.md task-tracking rule (folds into Phase 6's commit, not its own).
