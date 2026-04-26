# Phase 6 — Deploy to Railway and Verify End-to-End

> **Status:** Complete — commit `d8f2bb7` (`chore: deploy to Railway and verify end-to-end on live URL`).

Local contract for Phase 6. Companion to the authoritative roadmap in `docs/03-implementation-plan.md`; this document is the per-phase scope agreement.

## Goal

Stand up the app on Railway and prove it works end-to-end on the deployed URL. **CI green on push is not the gate; the live URL behaving correctly is.** The same smoke tests we ran locally in Phase 5 must pass against the production runtime, and any deviation must be fixed and re-verified before the phase is declared done.

## Deliverables

1. **Railway project** connected to the GitHub repo, building from `main`.
2. **Reproducible deployment configuration** — either a committed `railway.json` (or `railway.toml`) at the repo root, **or** a documented set of Dashboard settings the README explains how to reproduce. No reliance on Railway-specific magic that another deployer can't replicate.
3. **Build command:** `npm ci && npm run build` (or whatever Railway's default surfaces — pinned explicitly either way).
4. **Start command:** `node dist/main.js` (production-mode boot, **not** `npm run start:dev`).
5. **Environment variables** set in Railway:
   - `NODE_ENV=production`
   - `PORT` — Railway provides; the app reads via `ConfigService` (already wired in Phase 1).
   - `DATA_FILE_PATH=./data/acme.json` (relative to repo root, which is also the runtime working directory).
   - `LOG_LEVEL=info` (or the agreed production default).
   - `.env.example` is the reference for what the Dashboard must populate.
6. **Husky `prepare` script** patched upfront to `"prepare": "husky || true"` so non-zero exits are swallowed. This is the well-known Railway + Husky pattern — we don't need a failing build log to discover it. Build log inspection on the first deploy confirms the fix worked, but is not used to discover whether a fix is needed.
7. **Trust-proxy configuration** added to `src/main.ts`. Without it, Express (and therefore the throttler) sees Railway's reverse-proxy IP instead of the real client IP, and per-IP rate limiting collapses to a single bucket for everyone. The fix is one line — exact form (`app.set('trust proxy', 1)` vs `app.getHttpAdapter().getInstance().set(...)`) verified against NestJS's Express adapter API during Section A.
8. **README placeholder line** near the top: `Live URL: https://stock-analyzer-XXX.railway.app`. The full README is Phase 7's responsibility — Phase 6 only adds this single line so the deployed URL is captured the moment it's known.
9. **End-to-end verification log** in `tasks.md` — every check ticked against the deployed URL, not localhost.

## Build and start commands — locally first

The deployed runtime is the gate, but a local rehearsal of the same commands catches the cheapest class of failures before Railway sees them.

- `npm run build` must produce a clean `dist/` (already verified in Phase 5).
- `node dist/main.js` from the repo root must serve the static page at `/` and the API under `/api/*` and `/health`. If this works locally, the Railway runtime should match.
- The same smoke flow used in Phase 5 (G2, G5, G10) is the locally rehearsed checklist.

## Static asset path — already wired

Static files served via `app.useStaticAssets(join(process.cwd(), 'public'))`. This works on Railway because the working directory at runtime is the repo root, where `public/` lives. The build artefact (`dist/`) does not contain a copy of `public/` — both must be present in the deployment, which is the default behaviour of git-based deployment to Railway. `nest-cli.json` deliberately does **not** declare an `assets` config; same-origin static serving works directly off the source tree at runtime.

## Husky and the production build

`package.json` declares `"prepare": "husky"`. `npm ci` invokes `prepare` after install. On Railway, that step can fail in production environments and break the build. The well-known pattern is to swallow non-zero exits upfront:

```json
"prepare": "husky || true"
```

Phase 6 applies this fix **before the first deploy**, not in response to a failing build log. Build-log inspection still confirms the fix worked (no `prepare` failure halts the build), but it does not gate-keep whether the fix gets applied.

## Trust proxy and the throttler

Behind Railway's reverse proxy, every incoming request appears to originate from Railway's loopback. Without `trust proxy` set on the Express adapter, the throttler keys per-IP rate limits on that single proxy IP — every client shares one bucket. The fix is one line in `src/main.ts`:

```typescript
app.set('trust proxy', 1);
// or, if NestJS's Express adapter does not expose .set() directly:
// app.getHttpAdapter().getInstance().set('trust proxy', 1);
```

The exact form depends on what the current `NestExpressApplication` API exposes. Section A verifies which form NestJS's Express adapter accepts and applies that. The `1` value tells Express to trust one hop (Railway's proxy) and read `X-Forwarded-For`'s first non-trusted entry as the client IP — appropriate for Railway's single-proxy topology.

## End-to-end verification on the live URL

Every check below runs against the deployed Railway URL, not localhost. The verification is recorded as a discrete checklist in `tasks.md`.

1. Page loads: GET `/` returns the index page with status 200.
2. Browser console: zero CSP violations across the load.
3. Pico styling and Alpine initialisation visible (header populates from `/api/dataset`).
4. `/api/dataset` returns the metadata envelope (symbol, name, currency, from, to, intervalSeconds).
5. `/api/analyze` over the full window returns the expected buy/sell pair.
6. `/api/analyze` over each of the four engineered sub-windows (trending AM, choppy mid, lunch lull, sell-off) returns distinct, plausible results — confirming the dataset shipped intact and the algorithm is wired through.
7. `/api/analyze` with `from >= to` returns an `INVALID_RANGE` error envelope.
8. `/api/analyze` with a window outside the dataset returns an `OUT_OF_BOUNDS` error envelope.
9. `/api/analyze` with a sub-second timestamp (e.g. `2026-04-22T09:30:00.500Z`) returns an `INVALID_TIMESTAMP` error envelope.
10. `/health` returns 200 with `{ status: 'ok' }`.
11. **Throttler verification:** hammer `/api/analyze` 60+ times within a minute (Postman runner, `curl` loop, or a tiny script). The 61st request returns 429 with the throttler's response.
12. **Logs:** Railway log viewer shows structured JSON (single-line records with `level`, `time`, `msg`, request fields), not plaintext or pretty-printed output.

If any check fails, fix in a follow-up commit, push, wait for the Railway redeploy, re-verify. The fixes count as part of Phase 6 — they do **not** spawn separate phases.

## Round-trip discipline

The deployment itself is the test. Phase 6 is "done" only when **every** verification step passes against the deployed URL, the README has the placeholder URL line, and the commit message references the verification was completed. No partial-pass declarations.

## TDD scope

Per CLAUDE.md and the per-phase pattern:

- Phase 6 is **test-after** at most. The deployment itself is the verification surface; few or no automated test additions are expected.
- If a smoke test that hits the live URL programmatically is added (optional), it falls under test-after and the F0/H0 self-review applies.

## F0 / H0 self-review — limited applicability

The two-rule self-review (_what bug does this catch?_ + _which path does it exercise?_) carries forward in spirit. If Phase 6 adds **no** new automated tests, the self-review is a no-op. If it adds any (e.g. a programmatic live-URL smoke), apply both rules and record the articulations in the commit message body.

## In scope

- Railway project connected to the repo and configured to build/start correctly.
- Reproducible config (committed `railway.json`/`railway.toml` or documented Dashboard settings).
- Environment variables populated per the list above.
- Husky `prepare` confirmed harmless in production.
- The 12-step end-to-end verification checklist run against the live URL.
- One commit when verification is complete; the placeholder README live-URL line is folded into that commit.
- Phase 5 retroactive bookkeeping (status header confirmation, any tasks ticked retroactively) folded into Phase 6's commit per CLAUDE.md.

## Out of scope (deferred to later phases)

- The full README — Phase 7 writes the rest.
- Postman collection — Phase 7.
- Custom domain, TLS configuration beyond Railway's defaults — not needed for the take-home.
- Auto-scaling, multi-region, blue/green — single instance is the brief.
- Observability dashboards, log aggregation beyond Railway's built-in log viewer — out of scope.
- Visual rebrand — Phase 7 conditional on Figma guideline permitting external use.
- Dependabot triage — deferred to Phase 7.

## Out of test scope

Tests validate our code's contract, not third-party behaviour. Explicitly **not** tested in Phase 6:

- **Railway's runtime correctness.** We verify our app works on Railway, not that Railway's platform is bug-free. Build-system bugs, Nixpacks bugs, container-runtime bugs are out of scope.
- **Helmet's default headers beyond CSP.** Configured in Phase 5; we don't re-assert their values here.
- **Node.js runtime correctness.** Pinned dev runtime is whatever Railway selects; we don't assert Node version invariants.
- **TLS / certificate correctness.** Railway provides; we trust it.
- **CDN / edge caching behaviour.** Not configured; default direct-from-app serving.
- **Visual regression on the live URL.** Same reasoning as Phase 5 — manual eyeball check is proportionate.

Phase 6's verification is **"our app works on Railway,"** not **"Railway works."**

## Success criteria

- Deployed Railway URL serves the page and all three API surfaces (`/api/dataset`, `/api/analyze`, `/health`) correctly.
- All 12 end-to-end verification checks pass against the deployed URL.
- Build log shows `prepare` did not error.
- Logs in Railway are structured JSON.
- README has the `Live URL: ...` placeholder line.
- `npm run lint` clean; `npm run typecheck` clean; `npm test` all green; `npm run build` clean; `npm audit --audit-level=high` clean (re-run before commit even though no source changes are expected).
- Phase 6 lands as a single atomic commit. Suggested message (final wording in tasks.md): `chore: deploy to Railway and verify end-to-end on live URL`.

## Dependencies on prior phases

- **Phase 1:** `@nestjs/config` reads `PORT` from env (Railway-provided). `.env.example` is the env-var reference.
- **Phase 2:** `DATA_FILE_PATH` resolves to the committed `data/acme.json` at runtime.
- **Phase 4:** error envelopes (`INVALID_RANGE`, `OUT_OF_BOUNDS`, `INVALID_TIMESTAMP`) are what the verification asserts on.
- **Phase 5:** `useStaticAssets(process.cwd()/public)`, Helmet CSP (`unsafe-inline` for styles, `unsafe-eval` for Alpine), throttler (60/min on analyze, 120/min on dataset).

## Risks

- **`process.cwd()` resolves differently on Railway than expected.** Mitigated by the build-and-run-locally rehearsal — if `node dist/main.js` from the repo root works, Railway should match. If not, the fix is in Phase 6's scope (likely `__dirname`-relative path or a `RAILWAY_PROJECT_DIR`-aware variant).
- **Runtime invocation changes the working directory.** If anything ever runs the app via `cd dist && node main.js` (or any other non-repo-root cwd), the `process.cwd()/public` path breaks and the static page 404s. Mitigation: don't change the runtime invocation; Railway's default is the repo root, and the start command is pinned to `node dist/main.js` from there.
- **Husky `prepare` errors during `npm ci`.** Mitigated upfront by `"prepare": "husky || true"`; build-log inspection only confirms the fix worked.
- **CSP behaves differently on the deployed URL.** A test pass and a working browser are different states (Phase 5 lesson). Mitigated by repeating the browser CSP check against the live URL — it is the highest-risk surface in this phase.
- **Throttler not enforced behind Railway's proxy.** Mitigated upfront by adding `trust proxy` to the Express adapter so the throttler keys on the real client IP, not Railway's loopback. Verification step 11 confirms the fix works.
- **Deployment configuration drift between commits.** Mitigated by committing `railway.json`/`railway.toml` if used; Dashboard-only configuration must be documented in `tasks.md` (and later in the README).
- **Cold-start latency on Railway's free tier.** First request after idle may be slow; verification doesn't grade latency, so this is informational only.
- **NestJS `LegacyRouteConverter` warning at boot.** Two warnings of the form `Unsupported route path: "/api/*"` ... `Attempting to auto-convert...` are emitted on every boot (locally and on Railway). Source: NestJS 11 ships `path-to-regexp` v8, which deprecated bare `*` wildcards; NestJS's own middleware-exclusion internals (`@nestjs/core/middleware/utils.js` calling `LegacyRouteConverter.tryConvert`) still generate the legacy pattern when `setGlobalPrefix('api', { exclude: ['/health'] })` interacts with global middleware (helmet, useStaticAssets). The string `/api/*` does **not** appear in our source. Auto-conversion succeeds (`route.replace('*', '{*path}')`), routing works correctly, all 163 tests and the live URL verification pass. Fix lives upstream in NestJS 11.x; suppressing the warning by overriding `LegacyRouteConverter.logger` would also hide future legitimate warnings, so we accept the noise as a known NestJS-11-transitional notice.
