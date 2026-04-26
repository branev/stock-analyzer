# Branding — Tasks

> **Status:** In progress.

Sequential execution checklist. Work top-to-bottom. Each task should leave the working tree in a state where lint, typecheck, and test still pass.

Conventions:

- `[ ]` pending, `[x]` done.
- This work is **test-after** per CLAUDE.md. Frontend visual; manual browser verification is the verification surface.
- Each task is small enough that a junior engineer could pick it up without further context.
- All decisions in `requirements.md`'s "Decisions" section are binding — do not relitigate them mid-implementation.

---

## Section A — Stylesheet extraction, fonts, design tokens

> The existing inline `<style>` block in `public/index.html` is small (~15 lines) but the branding tokens + pills + button + form vars + eyebrow + warning banner will easily push it past 100 lines. Extract once at the start.

- [x] **A1.** Extract the existing `<style>` block from `public/index.html` into a new `public/styles.css`. Replace the inline block with `<link rel="stylesheet" href="styles.css" />` placed **after** the Pico stylesheet link (cascade order matters — our overrides must follow Pico). Confirm the page still renders identically before any branding work begins.

- [x] **A2.** Verify nothing broke: `npm run start:dev`, open `http://localhost:3000`, confirm the page looks identical to before A1 (red invalid borders, error styling, Pico defaults). DevTools console: zero new errors. Network tab: `/styles.css` returns 200 with `text/css` content-type.

- [x] **A3.** **Self-host Inter fonts.** Download woff2 files for weights 400 (Regular), 600 (Semi-Bold), and 700 (Bold) from a reputable source (rsms/inter GitHub release, google-webfonts-helper, or fonts.google.com → "Download family"). Place at `public/vendor/inter/inter-regular.woff2`, `inter-semibold.woff2`, `inter-bold.woff2` (or similar — names should make the weight obvious from the filename). Commit the binary files; same pinning rule as Pico and Alpine.

- [x] **A4.** Add `@font-face` declarations to the top of `public/styles.css`:

  ```css
  @font-face {
    font-family: 'Inter';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: url('vendor/inter/inter-regular.woff2') format('woff2');
  }
  /* repeat for 600 and 700 */
  ```

  `font-display: swap` so the browser shows fallback text immediately and swaps in Inter when loaded — avoids FOIT (flash of invisible text).

- [x] **A5.** Add the brand-palette `:root` variables at the top of `public/styles.css` (after `@font-face`, before any other rules). Copy verbatim from `docs/design_changes/stock-analyzer-design-instructions.md` — the design tokens block:

  ```css
  :root {
    --brand-charcoal: #151519;
    --brand-neon: #b0fb15;
    --brand-white: #ffffff;
    --brand-sand: #ebe8e0;
    --brand-indigo: #5e53e0;

    --surface-page: var(--brand-sand);
    --surface-card: var(--brand-white);
    --text-primary: var(--brand-charcoal);
    --text-muted: #5a5a60;
    --accent: var(--brand-neon);
    --accent-ink: var(--brand-charcoal);
    --warning: var(--brand-indigo);

    --leading-headline: 1.1;
    --leading-body: 1.4;
    --leading-eyebrow: 1;
    --tracking-eyebrow: 0.08em;
  }
  ```

- [x] **A6.** Map the brand tokens onto Pico's variables in the same `:root` block (added after the brand tokens, not in a separate `:root` declaration):

  ```css
  :root {
    --pico-background-color: var(--surface-page);
    --pico-color: var(--text-primary);
    --pico-primary: var(--accent);
    --pico-primary-hover: #9be612;
    --pico-primary-inverse: var(--accent-ink);
    --pico-font-family-sans-serif:
      'Inter', system-ui, -apple-system, sans-serif;
    --pico-form-element-background-color: var(--surface-card);
    --pico-form-element-border-color: var(--brand-charcoal);
    --pico-form-element-focus-color: var(--accent);
  }
  ```

- [x] **A7.** Browser smoke after A3-A6: page now shows Sand background, Inter font (visible in headings/labels), neon-coloured Pico interactive elements (button accent should be neon already via `--pico-primary`). DevTools → Computed → confirm `--pico-primary` resolves to `#B0FB15` and `--pico-background-color` to `#EBE8E0`. Network tab: three `inter-*.woff2` requests load with 200 from same origin.

---

## Section B — Headline pills

- [x] **B1.** In `public/index.html`, locate the existing `<header>` block:

  ```html
  <header>
    <hgroup>
      <h1 x-text="header.title">Loading…</h1>
      <p x-text="header.coverage">Loading coverage period…</p>
    </hgroup>
  </header>
  ```

  Replace with the three-pill stack (per Section C, the coverage paragraph becomes an eyebrow — for now, leave the `<p>` alone; C will rework it):

  ```html
  <header>
    <div class="headline-stack">
      <span class="pill pill--charcoal">Stock</span>
      <span class="pill pill--white">price</span>
      <span class="pill pill--neon">analyzer</span>
    </div>
    <p class="eyebrow" x-text="header.coverage">Loading coverage period…</p>
  </header>
  ```

  The pills are static — they are not bound to Alpine state. Drop the `header.title` Alpine state in C3 since nothing reads it.

- [x] **B2.** Add the `.headline-stack` and `.pill` rules to `public/styles.css`:

  ```css
  .headline-stack {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
    margin-bottom: 2.5rem;
  }
  .pill {
    display: inline-block;
    padding: 0.5rem 1.25rem;
    border-radius: 999px;
    font-family: 'Inter', sans-serif;
    font-weight: 700;
    font-size: 2.25rem;
    line-height: 1.1;
  }
  .pill--charcoal {
    background: var(--brand-charcoal);
    color: var(--brand-white);
  }
  .pill--white {
    background: var(--brand-white);
    color: var(--brand-charcoal);
  }
  .pill--neon {
    background: var(--brand-neon);
    color: var(--brand-charcoal);
  }
  ```

- [x] **B3.** Browser verify: three pills render top-to-bottom, left-aligned, in charcoal-white-neon order. Each pill is roughly the size of a single word's text plus equal padding. No icons. No outlines.

---

## Section C — Eyebrow line

- [x] **C1.** In `public/app.js`, simplify the Alpine `header` state. Currently:

  ```js
  header: { title: 'Loading…', coverage: 'Loading coverage period…' },
  ```

  Drop `title` (no longer rendered). Replace `coverage` so that on init it produces the bullet-separator line: `Acme Corporation • 2026-04-22 09:30 UTC → 15:59 UTC` (concrete shape — derive from `data.name` + `formatPickerTime(data.from)` + `formatPickerTime(data.to)`).

  Concrete example for the `init()` method:

  ```js
  this.header.coverage = `${data.name} • ${formatPickerTime(data.from)} UTC → ${formatPickerTime(data.to).split(' ')[1]} UTC`;
  ```

  (The `.split(' ')[1]` extracts just the time portion of the second timestamp since the date is the same day. If the date ever changed, the split would need rework — flag in a comment.)

- [x] **C2.** Add the `.eyebrow` CSS in `public/styles.css`:

  ```css
  .eyebrow {
    line-height: var(--leading-eyebrow);
    letter-spacing: var(--tracking-eyebrow);
    text-transform: none;
    font-weight: 700;
    font-size: 0.875rem;
    color: var(--text-muted);
    margin-top: 0;
    margin-bottom: 1.5rem;
  }
  ```

- [x] **C3.** Browser verify: eyebrow renders below the pill stack as a small, semi-bold, muted-charcoal line containing ticker name + bullet + coverage period in sentence case.

---

## Section D — Form elements

- [x] **D1.** Confirm form inputs already inherit charcoal borders, white backgrounds, and neon focus rings from the Pico variable overrides in A6. Tab through the From / To / Funds inputs in the browser — focus ring should be neon (`#B0FB15`).

- [x] **D2.** Adjust input border-radius. Add to `public/styles.css`:

  ```css
  input[type='datetime-local'],
  input[type='number'] {
    border-radius: 10px;
  }
  ```

  Medium rounding only — full pill is reserved for the headline and the button.

- [x] **D3.** Style labels. Add to `public/styles.css`:

  ```css
  label {
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    color: var(--text-primary);
  }
  ```

  Sentence case is already in the existing markup ("From", "To", "Available funds (USD, optional)").

- [x] **D4.** Browser verify: labels render in semi-bold charcoal Inter; inputs have ~10px rounded corners; focus ring is neon on tab.

---

## Section E — Analyse button

- [x] **E1.** Add the filled-neon-pill button styling to `public/styles.css`:

  ```css
  button[type='submit'],
  .btn-primary {
    background: var(--accent);
    color: var(--accent-ink);
    border: none;
    border-radius: 999px;
    padding: 0.875rem 2rem;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
    transition: background 0.15s ease;
  }
  button[type='submit']:hover {
    background: var(--pico-primary-hover);
  }
  button[type='submit']:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  ```

  This overrides Pico's default button styling. Existing markup already uses `<button type="submit">` so no HTML change.

- [x] **E2.** Verify disabled-state contrast. With `opacity: 0.5` on the disabled button, the effective rendered colour of charcoal text on neon background may drop below WCAG AA (≥4.5:1 for body text). In DevTools, screenshot the disabled state and run a contrast check on the rendered pixels (Lighthouse → Accessibility, or any contrast-checker extension). If contrast falls below 4.5:1:
  - **Fallback A:** swap to neutral grey background `#cccccc` instead of dimmed neon when disabled.
  - **Fallback B:** drop opacity to 0.6 instead of 0.5.

  Apply whichever passes; document the choice in the commit body if a fallback is used.

- [x] **E3.** Verify "Analyse" / "Analysing…" button copy is preserved (per Decision 5 in `requirements.md`). Currently the button just says "Analyse" with `:aria-busy="state.loading"`. The "…" text swap is **not currently in the markup** and is not required — the disabled state + Pico's `aria-busy` styling are sufficient signal. Skip the text swap.

- [x] **E4.** Browser verify: button is a filled-neon pill with charcoal text, full pill border-radius, hover darkens to `#9be612`. Disabled state renders with whatever fallback was applied in E2.

---

## Section F — Result area

- [x] **F1.** Confirm the existing result area has no card / box / border styling. The Phase 5 markup uses a bare `<section>` with no background or border — should be fine. If any background or padding is applied, remove it.

- [x] **F2.** Confirm Alpine bindings already use `<strong>` for numeric values. Existing markup at `public/index.html` lines 110-122 wraps `formatPickerTime(state.result.buy.time)`, `formatCurrency(...)`, etc. in `<strong>` tags. No change needed.

- [x] **F2.5.** **Window display in the result area.** The API response includes `state.result.window.from` and `state.result.window.to` (echoing the requested range). Confirm whether the current markup renders this anywhere; if not (which is the expected state — Phase 5 markup shows buy/sell/profit but not the window itself), add a small line **above** the result sentence inside the `<template x-if="state.result">` block:

  ```html
  <p class="result-window">
    For window
    <span x-text="formatPickerTime(state.result.window.from) + ' UTC'"></span>
    →
    <span x-text="formatPickerTime(state.result.window.to) + ' UTC'"></span>:
  </p>
  ```

  And add the CSS:

  ```css
  .result-window {
    color: var(--text-muted);
    font-size: 1rem;
    margin-top: 0;
    margin-bottom: 0.75rem;
  }
  ```

  Format consistently with the eyebrow's `<from> UTC → <to> UTC` shape so a reviewer can quickly correlate the eyebrow's coverage period with the request's actual window.

- [x] **F3.** Sentence-case copy check. Existing strings:
  - "No profitable trade in this window." — sentence case ✓ (keep verbatim, do **not** change to design doc's "No profitable trade found in this window." — the existing wording is correct and the rewording is cosmetic only).
  - Result sentence ("Buy at … for …, sell at … for …, profit … per share.") — sentence case ✓ verify it reads correctly with capitalised first letter.
  - Funds sentence ("With … you could have bought … shares for … total profit.") — sentence case ✓.

- [x] **F4.** Browser verify: result renders as plain prose on the Sand surface; numeric values bold (Inter Semi-Bold via `<strong>`); sentence case throughout.

---

## Section G — Error message + invalid-state border

- [x] **G1.** Update the existing `.error` CSS class in `public/styles.css`. Currently:

  ```css
  .error {
    color: #d62828;
    font-weight: 600;
  }
  ```

  Replace with:

  ```css
  .error {
    color: var(--text-muted);
    font-weight: 600;
  }
  ```

  Drops the red colour, switches to muted charcoal. Brand spec: no red anywhere.

- [x] **G2.** Replace the red invalid-border on date pickers (sub-decision from `requirements.md`). Currently:

  ```css
  input[type='datetime-local'][aria-invalid='true'] {
    border-color: var(--pico-form-element-invalid-border-color) !important;
  }
  ```

  Replace with charcoal-2px:

  ```css
  input[type='datetime-local'][aria-invalid='true'] {
    border-color: var(--brand-charcoal) !important;
    border-width: 2px !important;
  }
  ```

  If the 2px-charcoal signal reads as "no signal" during the G3 browser sweep (i.e. invalid state is visually indistinguishable from valid), fall back to:

  ```css
  input[type='datetime-local'][aria-invalid='true'] {
    outline: 2px solid var(--accent) !important;
    outline-offset: 2px;
  }
  ```

  Document the choice in the commit body.

- [x] **G3.** Browser verify: trigger an invalid range (`from === to` or `from > to`) and confirm:
  - Error message renders below the button in muted charcoal, semi-bold, sentence case. **No red.**
  - Date pickers show the chosen invalid signal (charcoal-2px or neon outline ring per G2 fallback).
  - **API message-quality check** (parenthetical, out of branding scope but worth noting): open the Network tab during the failing request, read the response body's `message` field. If it's terse, generic, or unhelpful (e.g. just `"Bad Request"` instead of explaining what's wrong), flag it in the commit body as a backend-message-quality follow-up — out of branding scope, but worth recording so it's not forgotten.

- [x] **G4.** **Augment OUT_OF_BOUNDS error message with available range (frontend-side).** When the API returns `code: "OUT_OF_BOUNDS"`, the user is told their window is outside the dataset but has to scroll up to see the eyebrow's coverage period to know what to pick instead. Close the loop by appending the available range to the rendered error — but only for `OUT_OF_BOUNDS`, not other error codes (the brand's "calm, informational" approach: helpful where directly relevant, quiet otherwise).

  In `public/app.js`, add a getter:

  ```js
  get displayedError() {
    if (!this.state.error) return null;
    if (this.state.errorCode !== 'OUT_OF_BOUNDS') return this.state.error;
    if (!this.dataset) return this.state.error;
    const fromShort = formatPickerTime(this.dataset.from);
    const toShort = formatPickerTime(this.dataset.to);
    return `${this.state.error} Available range: ${fromShort} UTC → ${toShort} UTC.`;
  }
  ```

  Update the error markup in `public/index.html` to bind `displayedError` instead of `state.error` directly:

  ```html
  <p
    x-show="state.error"
    x-text="displayedError"
    role="alert"
    class="error"
  ></p>
  ```

  Frontend-only change. No backend change. The hint reads exactly the same shape as the eyebrow line so the user gets visual continuity. Browser-verify in I8a (below) that this fires only for OUT_OF_BOUNDS.

---

## Section H — Reserved `.warning-banner` CSS class

> Per Decision 2 in `requirements.md`: keep CSS for future use, no markup wires it up.

- [x] **H1.** Add the `.warning-banner` rule to `public/styles.css` (placed near the bottom or in a clearly-commented "reserved for future use" section):

  ```css
  /* Reserved for future use: indigo-tinted informational banner.
   * Wire up only when the API gains a `warnings` field with `DATA_GAP` or
   * similar non-error signals. Currently the API does not emit warnings.
   */
  .warning-banner {
    background: #eceafa;
    color: var(--brand-charcoal);
    border-left: 3px solid var(--warning);
    padding: 0.875rem 1rem;
    border-radius: 8px;
    font-size: 0.9375rem;
    margin-bottom: 1rem;
  }
  ```

- [x] **H2.** Confirm no markup uses `.warning-banner` — it should appear nowhere in `public/index.html` or `public/app.js`. Pure dead CSS reserved for future wiring.

---

## Section I — Manual browser verification (mandatory before commit)

> 10-item sweep against `npm run start:dev`. Same approach as Phase 5's G-section. If any item fails, fix it before continuing to J.

- [x] **I1.** Page loads with Sand (`#EBE8E0`) background.
- [x] **I2.** Three pills render in charcoal/white/neon order, top to bottom, left-aligned. Each pill contains a single word; no icons; equal padding.
- [x] **I3.** Eyebrow line beneath the pills shows ticker name + bullet + coverage period in muted charcoal, semi-bold, small Inter.
- [x] **I4.** Form fields show charcoal borders, white backgrounds, charcoal label text. Tab focus shows neon focus ring.
- [x] **I5.** Analyse button is a filled-neon pill with charcoal text. Hover darkens to `#9be612`.
- [x] **I6.** Submit a profitable window (full day) — result renders as plain prose with `<strong>` on buy time, buy price, sell time, sell price, profit. Sentence case.
- [x] **I7.** Submit a flat / no-trade window — "No profitable trade in this window." renders identically styled.
- [x] **I8.** Submit `from === to` — `INVALID_RANGE` error renders in muted charcoal below the button. No red. Date pickers show the chosen invalid signal (G2 outcome). **API message-quality check** (per G3): open Network tab, read the response `message` field. If terse/unhelpful, note for the commit body.
- [x] **I8a.** Submit a window outside the dataset coverage (e.g. `from = 2020-01-01T00:00:00Z`, `to = 2020-01-02T00:00:00Z`) — `OUT_OF_BOUNDS` error renders in muted charcoal below the button, with the API's `message` visible. Same styling as I8. **G4 verification:** the error text must include the appended `Available range: <from> UTC → <to> UTC.` hint, formatted consistently with the eyebrow line. Confirm the hint appears **only** for OUT_OF_BOUNDS — re-check I8 (INVALID_RANGE) and verify the hint does **not** appear there. Optionally also test INVALID_TIMESTAMP via a hand-crafted URL (`/api/analyze?from=2026-04-22T09:30:00.500Z&to=...`) and confirm no hint there either.
- [x] **I9.** DevTools console: zero CSP violations across page load + analyse flow + error flow. No external font fetches in Network tab — only same-origin requests for `inter-*.woff2`.
- [x] **I10.** DevTools → Computed → `:root` → confirm `--pico-primary` = `#B0FB15`, `--pico-background-color` = `#EBE8E0`, `--brand-charcoal` = `#151519`.

---

## Section J — Accessibility colour-contrast checks

> Use DevTools' Accessibility pane, Lighthouse, or a contrast-checker extension. Document each measured ratio in the commit body.

- [x] **J1.** Charcoal `#151519` on Sand `#EBE8E0` — expected ≥ 14:1 ✓
- [x] **J2.** Charcoal `#151519` on Neon `#B0FB15` — expected ≥ 12:1 ✓
- [x] **J3.** Charcoal `#151519` on White `#FFFFFF` — expected ≥ 18:1 ✓
- [x] **J4.** White `#FFFFFF` on Charcoal `#151519` — expected ≥ 18:1 ✓
- [x] **J5.** Muted charcoal `#5a5a60` on Sand `#EBE8E0` — expected ≥ 5:1. **If actual is < 4.5:1**, darken the token to `#3a3a40` or `#404045` and re-measure. Update `--text-muted` in `public/styles.css`. Document the change in the commit body.

---

## Section K — README acknowledgment (skipped per user decision)

- [x] **K1.** **Skipped.** No additions to the README's Acknowledgments section as part of branding work. Visual design source is referenced internally in `docs/design_changes/` for our own context; the README stays as-is from Phase 7's commit.

---

## Section L — Verify and commit

- [ ] **L1.** Run `npm run lint`. Must be clean.
- [ ] **L2.** Run `npm run typecheck`. Must be clean.
- [ ] **L3.** Run `npm test`. Must be all green (no source TypeScript changed; tests should pass unchanged).
- [ ] **L4.** Run `npm run build`. Must be clean. Confirm `dist/` still builds correctly (no static-asset path regressions).
- [ ] **L5.** Run `npm audit --audit-level=high`. Must report zero vulnerabilities.
- [ ] **L6.** `git status` review:
  - Confirm new files staged: `public/styles.css`, `public/vendor/inter/inter-latin-var.woff2`, `docs/design_changes/requirements.md`, `docs/design_changes/tasks.md`, `docs/design_changes/stock-analyzer-design-instructions.md`.
  - Confirm modified files staged: `public/index.html`, `public/app.js`.
  - Confirm no stray scratch files or accidental commits of local screenshots.
  - **Note:** `README.md` is **not** in this stage list — Section K skipped per user decision; no Acknowledgments bullet added.
- [ ] **L7.** Stage explicitly (no `git add .`):
  - `public/styles.css` (new).
  - `public/vendor/inter/inter-latin-var.woff2` (new — single variable-font file covers weights 400-700).
  - `public/index.html` (modified — pill markup, stylesheet link, F2.5 result-window line, G4 displayedError binding).
  - `public/app.js` (modified — Alpine `header` state simplified per C1, `displayedError` getter added per G4).
  - `docs/design_changes/requirements.md` (new).
  - `docs/design_changes/tasks.md` (new).
  - `docs/design_changes/stock-analyzer-design-instructions.md` (new).
- [ ] **L8.** **Show before committing:** `git status`, `git log --oneline -5`, and the staged diff (`git diff --staged` — limit to non-binary files; the woff2 is binary). Wait for explicit user approval before running `git commit`.
- [ ] **L9.** Commit with message: `style: apply branded visual identity (palette, typography, pill headline)`. Body summarises:
  - The seven decisions from `requirements.md` and any sub-decisions resolved during implementation (G2 invalid-state — neon outline ring after 2px-charcoal fallback read as no-signal; E2 disabled-button — opacity 0.7 instead of 0.5 for WCAG AA; J5 muted-charcoal adjustment if any).
  - Self-hosted Inter as a single variable-font file under `public/vendor/inter/`.
  - The 10-item browser sweep + 5-item contrast check both passed.
  - Show-math accordion summary fix (Pico v2's `--pico-accordion-active-summary-color` was inheriting our overridden `--pico-primary-hover`; pinned to charcoal).
  - Post-Phase-7 polish note: this commit applies a visual theme to the existing analyzer; no API, algorithm, or test changes.
- [ ] **L10.** Confirm pre-commit hook ran (lint-staged + typecheck) and the commit landed. Show `git log --oneline -3` and `git status`. Update `docs/design_changes/requirements.md` and `docs/design_changes/tasks.md` status headers to `Complete — commit <hash>`. Retroactively flip L6/L7/L8/L9/L10 to `[x]` per CLAUDE.md's task-tracking rule (folds into a subsequent commit, not its own).
- [ ] **L11.** Stop for user push approval. Do **not** push without explicit confirmation per the project's established flow.

---

## Out of scope (re-affirmed from `requirements.md`)

- Stock selector — design spec referenced one; we have a single hardcoded ticker. (Decision 1.)
- `DATA_GAP` warning markup — CSS class kept as dead code; no wiring. (Decision 2.)
- New API endpoints, error codes, or response shapes. (Decision 3.)
- Title Case, ALL CAPS, US "Analyze" copy. (Decision 5.)
- Google Fonts external fetch / CSP loosening. (Decision 6.)
- Pulsing-neon loading animation. (Decision 7.)
- Brand logo, symbol, wordmark. (Out of scope, hard rule.)
- Marketing graphic-device backgrounds. (Out of scope, hard rule.)
- Visual regression testing infrastructure. (Out of test scope.)
