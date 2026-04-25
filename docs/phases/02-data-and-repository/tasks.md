# Phase 2 — Tasks

Sequential execution checklist. Work top-to-bottom. Do not skip ahead. Each task should leave the working tree in a state where lint, typecheck, and test still pass — except inside an explicit red-step of a TDD cycle.

Conventions:

- `[ ]` pending, `[x]` done.
- "TDD cycle" = one red → green → refactor pass: write a failing test (red), write the minimum code that makes it pass (green), then refactor the production code (and tests if needed) without breaking green.
- Production code under `src/data/*` is TDD. The generator is test-after.

---

## Section A — Mock-data generator (test-after)

- [x] **A1.** Create `scripts/` directory.
- [x] **A2.** Create `scripts/generate-mock-data.ts` that:
  - Defines the constant `SEED = 0xACE`.
  - Defines `INTERVAL_SECONDS = 1` and `START_TIME = '2026-04-22T09:30:00Z'`.
  - Defines tick counts per phase: trending AM 5400, choppy mid 5400, lunch lull 5400, sell-off 7200. Total must equal **23,400**.
  - Implements an inlined seeded RNG (e.g. mulberry32). No new npm dependency.
  - Generates the four phases sequentially, rounding each tick price to two decimals via `Math.round(x * 100) / 100` at the moment it is appended to the array.
  - Writes the result as JSON to `data/acme.json` (creates the `data/` directory if absent). Trailing newline at end of file.
  - Object shape exactly: `{ symbol: 'ACME', name: 'Acme Corporation', currency: 'USD', startTime, intervalSeconds, prices }`.
- [x] **A3.** Add an npm script `generate:mock-data` that runs the generator via `ts-node scripts/generate-mock-data.ts`.
- [x] **A4.** Run `npm run generate:mock-data` and confirm:
  - `data/acme.json` exists.
  - The JSON parses.
  - `prices.length === 23400`.
  - `prices[0]` and `prices[prices.length - 1]` are finite numbers within the ~$100–$130 plausibility band.
- [x] **A5.** Run `npm run generate:mock-data` a second time and confirm `data/acme.json` is byte-identical to the first run (use a SHA-256 or `cmp` check). This proves determinism.
- [x] **A6.** **Dataset-quality verification.** Run the algorithm against five to six sub-windows ad-hoc (one per phase, plus full-day, plus one cross-phase). Phase 3 hasn't built the algorithm yet, so write a tiny throwaway script that loads `data/acme.json` and brute-force scans each window for the best buy/sell pair, then prints the result per window. Confirm the windows produce **distinct buy/sell timestamps and meaningfully different profit magnitudes**. If they don't, retune the per-phase noise/drift parameters in the generator and rerun A4–A6 until variety is satisfactory. Delete the throwaway script before committing.

---

## Section B — Repository skeleton

- [x] **B1.** Create `src/data/` directory.
- [x] **B2.** Define the `PriceRepository` abstract class and the `DatasetMetadata` type in `src/data/`. Two abstract methods: `getDataset(): DatasetMetadata` and `getPriceSeries(from: Date, to: Date): readonly number[]`. No implementation yet.
- [x] **B3.** Define `OutOfBoundsError` (domain error class extending `Error`) in the same area. No HTTP-layer concerns.

---

## Section C — `FilePriceRepository` integrity check (TDD)

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

For each rule below, run a complete red → green → refactor cycle. Use real fixture files in a unique temp directory per test (`fs.mkdtempSync(path.join(os.tmpdir(), 'price-repo-'))`); do not mock `fs`. Each test passes a fixture path into the repository's constructor or initialisation.

- [x] **C1.** Cycle: rejects when **the file does not exist**. Test asserts the boot-time initialisation throws (or causes the equivalent failure path).
- [x] **C2.** Cycle: rejects when the file exists but contains **unparseable JSON**.
- [x] **C3.** Cycle: rejects when `intervalSeconds` is **missing**.
- [x] **C4.** Cycle: rejects when `intervalSeconds` is **zero**.
- [x] **C5.** Cycle: rejects when `intervalSeconds` is **negative**.
- [x] **C6.** Cycle: rejects when `intervalSeconds` is **fractional** (e.g. `0.5`).
- [x] **C7.** Cycle: rejects when `intervalSeconds` is **non-numeric** (e.g. the string `"1"`).
- [x] **C8.** Cycle: rejects when `prices` is **missing**.
- [x] **C9.** Cycle: rejects when `prices` is an **empty array**.
- [x] **C10.** Cycle: rejects when `prices` contains a **non-numeric entry** (string, `null`, etc.).
- [x] **C11.** Cycle: rejects when `prices` contains **`NaN`** or **`Infinity`**.
- [x] **C12.** Cycle: **happy-path init** — a well-formed fixture loads without throwing and the repository becomes usable.
- [x] **C13.** **Refactor pass after green-on-all.** Look at the rejection branches and consolidate any duplication into a single integrity-check function or method. Tests must remain green. The error message in each failure path must name the file path and the specific problem.

---

## Section D — `getPriceSeries` slicing (TDD)

> **Test scope:** see "Out of test scope" in `requirements.md`. Each test asserts contract behaviour, not third-party or internal state.

Use a small fixture (e.g. 10 ticks) for these unit tests. The fixture's `startTime` and `intervalSeconds` must be read from the file, not hardcoded in the slicing logic.

- [x] **D1.** Cycle: returns the **full series** when `from` equals `startTime` and `to` equals the last tick's timestamp.
- [x] **D2.** Cycle: returns a **single tick** when `from` and `to` both equal the same valid tick timestamp.
- [x] **D3.** Cycle: returns an **interior slice** correctly (e.g. ticks 3–7 of a 10-tick fixture).
- [x] **D4.** Cycle: window is **inclusive on both ends** — boundary timestamps are included in the slice.
- [x] **D5.** Cycle: throws `OutOfBoundsError` when `from` is **before** `startTime`.
- [x] **D6.** Cycle: throws `OutOfBoundsError` when `to` is **after** the last tick's timestamp.
- [x] **D7.** Cycle: throws `OutOfBoundsError` when **both endpoints** are out of bounds.
- [x] **D8.** Cycle: throws `OutOfBoundsError` when `from` is misaligned to the tick grid (does not fall on `startTime + i * intervalSeconds`). (Decision-point: throw OOB or snap to nearest tick? Default: throw OOB. If you choose differently, write the rationale into the test name and stop here for confirmation.)
- [x] **D9.** Cycle: `getDataset()` returns the metadata correctly — `from` is `startTime`, `to` is the timestamp of the last tick (`startTime + (prices.length - 1) * intervalSeconds`).
- [x] **D10.** **Refactor pass.** Ensure all index↔time arithmetic reads `intervalSeconds` from the loaded dataset. Grep the repository code for the literal `1` and confirm none of them mean "one second." If any do, replace with `intervalSeconds`.

---

## Section E — Repository wiring + integration

- [x] **E1.** Decide between `DataModule` (a dedicated NestJS module) and adding the providers directly to `AppModule`. Default: `DataModule` for separation of concerns; revisit if it adds no value.
- [x] **E2.** Register the providers so `PriceRepository` (the abstract class) is the DI token and `FilePriceRepository` is the binding (`{ provide: PriceRepository, useClass: FilePriceRepository }`).
- [x] **E3.** `FilePriceRepository` reads `DATA_FILE_PATH` from `ConfigService` (do not read `process.env` directly). The Zod schema in Phase 1 already validates and supplies the default `./data/acme.json`.
- [x] **E4.** Wire the integrity check into NestJS's `OnModuleInit` (or equivalent lifecycle) so failure aborts boot.
- [x] **E5.** Integration-flavoured test: with `DATA_FILE_PATH` pointing at the committed `data/acme.json`, the repository initialises cleanly, `getDataset()` returns plausible metadata, and `getPriceSeries(startTime, startTime)` returns a single-element array.

---

## Section F — Verify and commit

- [x] **F0.** **Test-scope self-review.** Before running the verification commands below, walk through every `it(...)` block added in Phase 2. For each, articulate in one sentence: _"if this test fails, what bug in our code has been introduced?"_ If the answer involves a third-party library (Node primitives, `JSON.parse`, `mulberry32` stats), NestJS framework wiring beyond what E5 covers, or an implementation detail that doesn't affect the public contract — delete the test. List the articulations and any deletions in the final report at F9.
- [x] **F1.** Run `npm run lint`. Must be clean.
- [x] **F2.** Run `npm run typecheck`. Must be clean.
- [x] **F3.** Run `npm test`. Must be all green. The new spec files for the repository must show in the suite list.
- [x] **F4.** Run `npm run build`. Must be clean.
- [x] **F5.** Run `npm audit --audit-level=high`. Must report zero vulnerabilities at this level.
- [x] **F6.** `git status` review:
  - Confirm `data/acme.json` is tracked (not gitignored).
  - Confirm `node_modules/`, `dist/`, `coverage/` are absent from staging.
  - Confirm no throwaway verification script from A6 is left on disk.
- [x] **F7.** Stage explicitly (no `git add .`):
  - `scripts/generate-mock-data.ts`
  - `data/acme.json`
  - `src/data/` (whatever the repository module produced)
  - Updates to `src/app.module.ts` and `package.json` if applicable
- [ ] **F8.** Commit with message exactly: `feat: add mock-data generator and file-backed price repository with boot-time integrity check`. Include a body that summarises the four phases, the seed value, the integrity-check rule list, and the dataset-quality verification step.
- [ ] **F9.** Confirm the pre-commit hook ran (lint-staged + typecheck) and the commit landed. Show `git log --oneline -3` and `git status`.
