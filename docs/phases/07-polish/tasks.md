# Phase 7 — Documentation, Postman Collection, and Polish

> **Status:** Complete — commit `1734184` (`docs: add README, Postman collection, and close Phase 7`).

Final phase. Lighter than Phases 2–6: a single `tasks.md` (no separate `requirements.md`) — this doc is the spec. Companion to the authoritative roadmap in `docs/03-implementation-plan.md`.

Sequential execution checklist. Work top-to-bottom. Each task should leave the working tree in a state where lint, typecheck, and test still pass. `[ ]` pending, `[x]` done.

## Goal

Produce reviewer-facing materials so the take-home can be evaluated end-to-end from a clean clone: a complete README, a Postman collection that exercises every documented contract, an atomic git history that tells the story commit-by-commit, and the final retroactive bookkeeping that closes Phase 6 and Phase 7.

## Out of scope (explicitly)

- **Frontend redesign.** Pico defaults are the brief's expectation. Any visual rework is post-Phase-7 if time permits.
- **Visual rebrand.** Conditional on Figma guideline permitting external use; if pursued, it's post-Phase-7 work, not Phase 7 itself.
- New endpoints, algorithm changes, or test additions for behaviours that aren't already in scope.

---

## Section A — README.md (full)

> Replaces the placeholder README from Phase 6 (commit `d8f2bb7`) with the full reviewer-facing document. Pull architecture details and decisions from `docs/01-stock-analyzer-analysis.md` and link to it for "further reading"; do not duplicate analysis content in the README.

- [x] **A1.** **Title and brief description.** One-sentence elevator pitch. Suggested: "Stock Price Analyzer — a NestJS web app that finds the optimal buy/sell pair within a chosen time slice of an intraday price series, optimising profit per share."

- [x] **A2.** **Live URL.** Single line near the top: `Live URL: https://stock-analyzer-production-b678.up.railway.app/`. (Already in the Phase 6 placeholder — preserve verbatim, do not move.)

- [x] **A3.** **What the project is and the algorithm goal.** One paragraph. Cover: synthetic ACME ticker, second-precision intraday data, the "best-trade" algorithm finds (buy_index, sell_index) that maximises `prices[sell] - prices[buy]` subject to `buy < sell`. Single-pass O(n) running-minimum approach. Tiebreaker: earliest-buy primary, earliest-sell secondary.

- [x] **A4.** **Architecture overview.** One to two paragraphs. **Implemented:** described the actual flat structure (single `AppModule` + `DataModule` only feature module + un-modulised controllers + pure-function algorithm), not the aspirational `AnalysisModule/ApiModule` shape. Cross-cutting concerns (Helmet CSP, JSON logging, error envelope, no-CORS) called out in a second paragraph around the diagram per A4.5's "policies in prose" rule.

- [x] **A4.5.** **Mermaid request-flow diagram.** Insert a Mermaid `flowchart LR` block in the Architecture section right after A4's paragraphs and before the `docs/01-stock-analyzer-analysis.md` "further reading" link. Renders natively on GitHub — no separate image file.

  Show the path data takes through the system: **browser → entry (static asset OR `/api/*` controller) → ValidationPipe & ThrottlerGuard → algorithm OR exception filter (error envelope) → DataModule (PriceRepository) → response back to browser**. Keep it simple: one screen worth of nodes, left-to-right layout, no nested subgraphs.

  Cross-cutting concerns — Helmet CSP, structured JSON logging via `nestjs-pino`, error-envelope shape `{statusCode, error, message, code}`, same-origin (no CORS) policy — stay in the prose around the diagram, **not** as nodes inside it. The diagram is for the path; the prose is for the policies. Two reasons: (a) cluttering the diagram with policy-nodes obscures the flow, (b) policies apply to every node so they'd duplicate visually.

- [x] **A5.** **Run locally.** Numbered steps: 0. **Prerequisites:** Node.js (version specified by `package.json`'s `engines` field — read it from there at the time of writing the README so the value is current). npm 11+ for `min-release-age` interpretation in days.
  1. `git clone <repo>` and `cd stock-analyzer`.
  2. `npm install` (respects `min-release-age=7` in `.npmrc`; first install may take a moment as npm resolves the cooldown).
  3. `cp .env.example .env` (defaults work as-is for local dev).
  4. `npm run start:dev` — opens on `http://localhost:3000`.
  5. (Optional) `npm run generate:mock-data` regenerates `data/acme.json` from the seeded RNG. Output is byte-identical across machines (seed `0xACE`).

- [x] **A6.** **Run tests.** Numbered steps with one-line "what each covers" notes:
  - `npm test` — unit + integration tests across 6 suites (algorithm + tiebreaker + brute-force property test, repository + boot-time integrity check, API controllers + DTO validation, throttler + skip-on-/health, static-serving route precedence, exception envelope).
  - `npm run test:e2e` — minimal e2e against `/health`, ensures the bootstrap path doesn't regress.
  - `npm run lint`, `npm run typecheck`, `npm run build` — quality gates also enforced by CI and the pre-commit hook.

- [x] **A7.** **CI overview.** One paragraph. `.github/workflows/ci.yml`: install (cached), lint, `tsc --noEmit`, `npm test`, `npm run build`, `npm audit --audit-level=high`. Husky pre-commit hook runs lint-staged (`eslint --fix` + `prettier --write`) and `tsc --noEmit` on every commit so quality issues fail at commit time, not at CI time.

- [x] **A8.** **Tiebreaker interpretation note with worked example.** Inline the example directly in the README so a reviewer doesn't have to open `docs/`:

  > Prices `[5, 6, 5, 6]`. Maximum profit is 1, achievable two ways: buy at index 0, sell at index 1; or buy at index 2, sell at index 3. The earliest-buy-primary rule selects the first pair (index 0 → index 1). If two pairs tie on both profit and buy-index, the earliest-sell secondary rule chooses between them.

  Add the **two-interpretation framing** explicitly (not just the chosen rule):

  > The brief's phrase "earliest and shortest" admits two readings: (a) **earliest-buy-primary** — among optimal pairs, prefer the one with the smallest buy index; (b) **shortest-duration-primary** — among optimal pairs, prefer the one with the smallest `sell - buy` index gap. On real intraday data the two readings produce the same answer in practice (genuine ties on profit are rare). We chose **earliest-buy-primary** because it matches the trader's intuitive question "when should I have entered?" — entry time, not time-in-market. The choice is documented at the algorithm layer (`src/analysis/best-trade.ts`) and asserted by the tiebreaker tests.

  Mention: the funds rule is `floor(availableFunds / buyPrice)` shares, computed client-side; the server doesn't see funds.

- [x] **A9.** **Postman collection usage.** One paragraph pointing to `docs/stock-analyzer.postman_collection.json`. Steps: import into Postman, set the `baseUrl` collection variable to either `http://localhost:3000` or the deployed Railway URL, run any request or the whole collection. Folder structure: Health, Metadata, Happy path, Errors.

- [x] **A10.** **Future work.** Short bullet list, no commitments. Examples: (a) price chart of the selected window (mentioned in the brief as optional), (b) richer tiebreaker telling the user when multiple optimal pairs existed, (c) WebSocket streaming for live tickers, (d) per-user funds persistence.

- [x] **A11.** **Acknowledgments.** Brief. Pico CSS, Alpine.js, NestJS, the take-home prompt source. No emoji unless explicitly requested.

- [x] **A12.5.** **For evaluators.** Short subsection between Acknowledgments and Further reading, oriented at a time-pressed reviewer. Bullet list pointing at the most informative code paths first:
  - `src/analysis/best-trade.ts` — the algorithm itself: single-pass O(n) running-min with explicit tiebreaker. Read this first; it's the heart of the take-home.
  - `src/analysis/best-trade.spec.ts` — TDD example sequence, hand-crafted tiebreaker cases, and the brute-force property test (100 random arrays compared against an O(n²) reference). Shows the test-first discipline in action.
  - `src/api/api.spec.ts` — integration tests via `Test.createTestingModule`: happy path, all error codes, validation, throttler 429, /health bypass. Single file covering the full HTTP surface.
  - `data/acme.json` — the committed deterministic dataset (regeneratable via `npm run generate:mock-data` from seed `0xACE`).

- [x] **A12.** **Further reading.** Three links: `docs/01-stock-analyzer-analysis.md` (rationale), `docs/02-stock-analyzer-brief.md` (contract), `docs/03-implementation-plan.md` (phased execution roadmap with per-phase docs under `docs/phases/`).

---

## Section B — Postman collection

> File: `docs/stock-analyzer.postman_collection.json`. Postman v2.1 collection format. Collection-level variable `baseUrl` defaulting to `http://localhost:3000`. The README explains how to switch to the Railway URL.

- [x] **B1.** Create the collection file with:
  - Collection name: `Stock Price Analyzer`.
  - Collection-level variable: `baseUrl` = `http://localhost:3000`.
  - Folder structure as below; each request named, has a one-line description, and uses `{{baseUrl}}` as the host prefix.

- [x] **B2.** **Health folder.** One request: `GET /health`.

- [x] **B3.** **Metadata folder.** One request: `GET /api/dataset`.

- [x] **B4.** **Happy path folder.** Four requests with the exact query params from F4-F7 of Phase 6 (full window + trending AM + lunch lull + sell-off). Each description includes the expected buy/sell/profit values verified live on the Railway URL.

- [x] **B5.** **Errors folder.** Three requests, one per error code (INVALID_RANGE, OUT_OF_BOUNDS, INVALID_TIMESTAMP), with the exact query params from F8-F10 of Phase 6. Each description names the expected error envelope shape.

- [x] **B6.** **Manual import test.** Import the file into Postman desktop. Run each request once against `localhost:3000` (with `npm run start:dev` running) and once against the deployed Railway URL. Confirm all 9 requests return the expected status. If any deviates, fix the request definition (most likely cause: typo in query param) and re-export. **Confirmed by user: tested in Postman, works great.** v2.1 schema accepted; `{{baseUrl}}` substitution resolves correctly; all 9 requests run as designed against the Railway default.

---

## Section C — Atomic-commit history review

> Goal: confirm `main`'s history reads as a clean phase-by-phase story. Squash or amend only if a commit is genuinely non-atomic or its message misrepresents the diff. Avoid history-rewriting for cosmetic reasons — if it's already clean, document that finding and move on.

- [x] **C1.** Run `git log --oneline` (full history) and capture the output. List every commit on `main` from the initial scaffold to `d8f2bb7`. **15 commits captured (`428cf9c` through `d8f2bb7`).**

- [x] **C2.** **For each commit, articulate two things. Record findings in the Phase 7 commit body, not in this doc.** **Done — all 15 commits walked. Every message accurately describes its diff; every commit is atomic in the sense that matters (one cohesive change or one phase's deliverables + retroactive bookkeeping per the project's deliberate CLAUDE.md task-tracking rule). Findings will land in the Phase 7 commit body.**

- [x] **C3.** **Plan any rebase before executing.** **Plan: empty.** Two theoretical squash candidates considered (`3eef3d5` → `34a0d11`; `168759e` → `1f520a2`) but rejected: in both cases the predecessor was already on `main` when the follow-up landed, so squashing now requires force-push (destructive op against published history) for purely cosmetic gain.

- [x] **C4.** **If the plan is non-empty:** execute the rebase. **If the plan is empty:** record the finding. **History already clean — no rebase needed.**

- [x] **C5.** Confirm CI green on the post-rebase push. **N/A — C4 was a no-op.**

> **Why this section even exists when each phase commit was already drafted carefully:** a final pass with the full history visible catches the kind of issues only a 30,000-foot view exposes — e.g. two follow-on commits from the same phase that are now obviously squashable, or a phase commit whose message no longer reflects what the diff ended up containing after round-trip fixes. Often this section is a no-op, which is the desired outcome: it means the per-phase commit discipline held.

---

## Section D — Retroactive bookkeeping

- [x] **D1.** **Phase 6 J6-J9 retroactive ticks.** Flip the four boxes in `docs/phases/06-deploy/tasks.md` Section J that necessarily remained `[ ]` at Phase 6 commit time (J6 git-status review, J7 stage, J8 commit message, J9 hash + status header update + this very retroactive flip). They describe acts that happen in or after the Phase 6 commit itself — exactly the case CLAUDE.md's task-tracking rule says folds into a subsequent commit.

- [x] **D2.** **Phase 6 status header update.** In `docs/phases/06-deploy/requirements.md`, change `Status: In progress.` to `Status: Complete — commit d8f2bb7 (chore: deploy to Railway and verify end-to-end on live URL).`

- [x] **D3.** **Phase 7 status header update (deferred to F-section commit).** Once Phase 7's commit lands, the next push retroactively flips Phase 7's status header to Complete. Leave this for after F1-F8 close out.

- [x] **D4.** **Phase 7 task ticks.** Tick A1-A12, B1-B6, C1-C5 (or the subset executed), and D1-D2 as each completes. F-section ticks (F1-F7) flip retroactively along with D3 in a future commit.

---

## Section E — Dependabot triage (optional)

> Skip entirely if time is tight. The presence of open Dependabot PRs is itself useful evidence that the cooldown + audit + min-release-age policies work — they catch updates and pause them for human review.

- [ ] **E1.** Open the Dependabot PR list (GitHub → Pull Requests → filter `is:open author:app/dependabot`).

- [ ] **E2.** **Major version bumps:** close with an explanatory comment naming the breaking-change risk and citing that the take-home isn't graded on dependency currency. Examples to anticipate: NestJS 11→12, TypeScript 5→6, etc.

- [ ] **E3.** **Safe minor/patch bumps:** review the changelog for each, run `npm test` against the proposed `package.json`/`package-lock.json` locally, and merge if green. If you're not sure whether a bump is safe, close with a comment rather than guess.

- [ ] **E4.** Record the action taken per PR (closed / merged) in the eventual commit body, so the reviewer sees that Dependabot's signal was triaged, not ignored.

---

## Section F — Verify and commit

- [x] **F1.** Run `npm run lint`. Must be clean.
- [x] **F2.** Run `npm run typecheck`. Must be clean.
- [x] **F3.** Run `npm test`. Must be all green (163 tests, 6 suites — or whatever count is current). **163 tests / 6 suites.**
- [x] **F4.** Run `npm run build`. Must be clean.
- [x] **F5.** Run `npm audit --audit-level=high`. Must report zero vulnerabilities at this level. **0 vulnerabilities.**
- [x] **F6.** **Show me before committing:** `git status`, `git log --oneline -10`, and the staged diff (`git diff --staged`). Wait for explicit approval before running `git commit`.
- [x] **F7.** Stage explicitly (no `git add .`):
  - `README.md` (full content replacing the Phase 6 placeholder).
  - `docs/stock-analyzer.postman_collection.json` (new).
  - `docs/phases/06-deploy/requirements.md` (D2 status-header update).
  - `docs/phases/06-deploy/tasks.md` (D1 J6-J9 ticks).
  - `docs/phases/07-polish/tasks.md` (status header update + all ticks accumulated through the phase).
  - Any Dependabot PRs merged in E (already on main via PR merges, so not staged here).
- [x] **F8.** Commit with message exactly: `docs: add README, Postman collection, and close Phase 7`. Body summarises:
  - What's in the README (sections A1-A12 by topic, not verbatim list).
  - The Postman collection structure (4 folders, 9 requests, `baseUrl` variable).
  - The history-review findings from C (clean / squashed / amended).
  - Dependabot triage outcome from E (or a one-liner if skipped).
  - Phase 6 retroactive bookkeeping folded in (D1-D2).
  - Phase 7 status: complete.

---

## Success criteria

- README readable on GitHub renders cleanly (no broken markdown, no missing sections).
- Postman collection imports into Postman and all 9 requests run green against both `localhost:3000` and the deployed Railway URL.
- `git log --oneline` reads as a clean phase-by-phase story (per Section C).
- All quality gates green: lint, typecheck, tests, build, audit.
- Phase 6 and Phase 7 status headers both read `Complete — commit <hash>`.
- The take-home can be evaluated end-to-end from a clean clone using only the README's instructions.
