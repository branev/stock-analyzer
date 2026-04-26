# Branding — Requirements

> **Status:** In progress.

Local contract for applying the brand's visual identity to the analyzer's existing frontend. Companion to [`stock-analyzer-design-instructions.md`](stock-analyzer-design-instructions.md) (the brand spec) — that doc is _what_ the visual system looks like; this doc is _what changes in our codebase_, _what stays out_, and _what we deliberately defer or modify_ relative to the brand spec.

This work is post-Phase-7. The take-home was already shipped at commit `b11be37`; this is opportunistic polish, not core scope.

## Goal

Apply the brand's palette, typography, and pill-as-headline graphic device to the existing analyzer page. **Theming, not rebuilding** — Pico CSS + Alpine.js + same-origin static serving all stay; only `public/index.html` and a small custom stylesheet (or the existing inline `<style>` block) should change.

## Out of scope (explicitly — preserved verbatim from the design instructions' "Do not" section, plus our own additions)

- **Brand logo, symbol, or wordmark** — borrow the visual _language_ (palette, type, pill shape), not the marks.
- **Graphic-device backgrounds** (stroked pills, organic circles, marketing fill compositions).
- **Additional colours** beyond the design tokens (no green for success, no red for errors, no shadows beyond Pico defaults on focus).
- **Title Case or ALL CAPS** anywhere — sentence case throughout.
- **API / backend changes** — no controller, DTO, repository, algorithm, or `data/acme.json` modifications. If the design spec asks for behaviour the current API doesn't support (e.g. `DATA_GAP` warnings, `NO_DATA_IN_WINDOW` error code), we adapt the design to what the API emits, not the other way around.
- **Vendor file swaps** — Pico stays pinned at `v2.0.6`, Alpine stays pinned at `v3.14.9`. No version bumps as part of branding.
- **Component restyling that bypasses Pico variables** — overrides go through `--pico-*` custom properties at `:root` per the design doc.

## Decisions

Mismatches between the design spec and the as-built analyzer, each resolved below. Decisions are binding; tasks.md operationalises them.

1. **Stock selector — DROPPED.** Design spec assumes one; we have a single hardcoded ticker (ACME). Adding a selector means new data + endpoints + tests, out of branding scope. Headline pills work as a generic title with one stock.

2. **`DATA_GAP` warning banner — DROPPED markup, KEPT CSS.** API never emits warnings; dataset has no gaps. The `.warning-banner` class stays in the stylesheet as dead code reserved for future use, but no markup wires it up.

3. **`NO_DATA_IN_WINDOW` error-code hint — REPLACED with uniform error styling.** Our API uses `OUT_OF_BOUNDS` / `INVALID_RANGE` / `INVALID_TIMESTAMP`, not `NO_DATA_IN_WINDOW`. Apply the design's "muted charcoal inline message below the button" rule to all error codes uniformly. The existing error envelopes already carry helpful messages.

4. **Headline copy vs. dataset header — REPLACE `<h1>` with pills, REFRAME coverage line as eyebrow.** Three-pill stack ("Stock / price / analyzer") replaces the dynamic ticker `<h1>`. The coverage paragraph collapses to a single eyebrow line: _Acme Corporation • 2026-04-22 09:30 UTC → 15:59 UTC_ (bullet separator, sentence case, muted charcoal).

5. **UK vs. US spelling — KEEP UK throughout.** Button copy stays `Analyse` / `Analysing…`. `canAnalyse` getter, `analyse()` method, all preserved. The API endpoint `/api/analyze` keeps US for HTTP-convention reasons; that's the only US spelling in the codebase.

6. **Inter font — SELF-HOST.** Download woff2 files for weights 400 / 600 / 700, place at `public/vendor/inter/`, declare via `@font-face`. No Google Fonts external fetch; no CSP loosening; consistency with the vendor-pinning rule used for Pico and Alpine.

7. **Loading-state motion — SKIPPED.** No pulsing underline. The disabled-button state is the only loading signal.

### Sub-decision arising from #3 (resolved during implementation)

The Phase 5 frontend uses a **red border** on date pickers when `invalidDateError` is true (CSS at `input[type='datetime-local'][aria-invalid='true']`). The brand spec says no red anywhere. We need a non-red invalid-state signal. **Recommended replacement:** charcoal at 2px (instead of the default 1px) when `aria-invalid="true"` — subtle but readable, no new colour. If 2px-charcoal reads as "no signal" during the manual sweep, fall back to a neon outline-offset ring; document the choice in the eventual commit body.

## Deliverables (subject to open-question resolution)

1. **CSS variable overrides** at `:root` in [`public/index.html`](../../public/index.html)'s existing inline `<style>` block (or extracted into [`public/styles.css`](../../public/) if the block grows past ~80 lines). Brand palette tokens + Pico variable mapping per the design doc's "Design tokens" section.
2. **Inter font self-hosted** at `public/vendor/inter/` (per Q6 recommendation B). Three weights: 400, 600, 700. `@font-face` declarations in the same stylesheet. No Google Fonts external fetch; no CSP loosening.
3. **Three-pill headline** replacing the current `<h1>` ticker name. Markup + CSS per the design doc's "headline-stack" section.
4. **Eyebrow line** below the pills containing ticker name + coverage period (per Q4 recommendation).
5. **Form-element styling** via Pico variable overrides (border colour, focus ring, input radius). No per-component CSS rewrites.
6. **Analyse button** restyled as filled-neon pill per the design doc's button section. Disabled state per existing Alpine `:disabled="!canAnalyse"` binding.
7. **Result area** rendered as plain prose on the Sand surface (no card backgrounds). `<strong>` on numeric values.
8. **Error message** styled as muted charcoal inline below the button (per Q3 recommendation). The existing `.error` class needs to lose its red colour and align with the charcoal-only palette.
9. **Manual browser verification** via chrome-devtools MCP, plus a deliberate accessibility check: charcoal-on-neon and charcoal-on-sand colour contrast ratios meet WCAG AA (≥4.5:1 for body, ≥3:1 for large text).

## TDD scope

Per CLAUDE.md and the existing project pattern:

- **Test-after** for everything in branding work — frontend visual is test-after per CLAUDE.md, and there are no algorithm/data changes in scope to TDD.
- **No new automated tests** are expected. The branding work is visual; manual browser verification is the verification surface, same approach as Phase 5.

## Out of test scope

- **Visual regression** (no screenshot diffs, no Percy, no Chromatic).
- **Pixel-perfect Figma matching** — design doc is the spec, not a Figma file with exact px values.
- **Font-rendering correctness** across operating systems (Inter renders slightly differently on Windows vs. macOS; out of scope to address).
- **Pico v2's internal CSS correctness** — we trust Pico to honour our variable overrides as documented.
- **Accessibility beyond colour contrast** (no full WCAG audit, no screen-reader walkthrough — out of branding-pass scope).
- **Print stylesheet** — none.

## Required verification

### Manual browser sweep (mandatory before commit)

Via chrome-devtools MCP against `npm run start:dev` — same approach as Phase 5's G-section:

1. Page loads with Sand background.
2. Three pills render in charcoal/white/neon order, top to bottom, left-aligned.
3. Eyebrow line beneath the pills shows ticker + coverage period.
4. Form fields show charcoal borders, white backgrounds, charcoal label text, neon focus ring on tab.
5. Analyse button is a filled-neon pill with charcoal text.
6. Submit a profitable window — result renders as prose with `<strong>` on numeric values, sentence case.
7. Submit a flat / no-trade window — "No profitable trade found in this window." renders identically styled.
8. Submit `from === to` — error message renders in muted charcoal below the button. No red.
9. DevTools console shows zero CSP violations (verifies the self-hosted Inter doesn't introduce external font fetches).
10. Inspect `:root` computed styles in DevTools — confirm `--pico-primary` resolves to `#B0FB15` and `--pico-background-color` to `#EBE8E0`.

### Accessibility colour-contrast check

Using DevTools' Accessibility pane or a JS snippet:

- **Charcoal on Sand** (`#151519` on `#EBE8E0`): expected ≥ 14:1 — pass.
- **Charcoal on Neon** (`#151519` on `#B0FB15`): expected ≥ 12:1 — pass.
- **Charcoal on White** (`#151519` on `#FFFFFF`): expected ≥ 18:1 — pass.
- **White on Charcoal** (`#FFFFFF` on `#151519`): expected ≥ 18:1 — pass.
- **Charcoal at muted contrast** (`#5a5a60` on `#EBE8E0`): expected ≥ 5:1 — verify.

If the muted-charcoal token (`#5a5a60`, used for `--text-muted` per the design doc) drops below 4.5:1 on Sand, adjust the value to a darker charcoal that still reads as "muted" relative to `#151519`.

## Success criteria

- All ten manual-browser-sweep items pass.
- All five colour-contrast checks pass at WCAG AA or better.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm audit --audit-level=high` all clean (no source TypeScript changes are expected, but the gates re-run as a sanity check).
- Single atomic commit. Suggested message (final wording in `tasks.md`): `style: apply branded visual identity (palette, typography, pill headline)` or similar.
- README acknowledgment update — **skipped** per user decision; the README stays as-is from Phase 7's commit. Internal docs in `docs/design_changes/` carry the design context.

## Dependencies on prior phases

- **Phase 5 (frontend + Helmet CSP):** `useStaticAssets`, the `public/` directory, the Helmet CSP carve-outs (`unsafe-inline` for styles, `unsafe-eval` for Alpine). All preserved.
- **Phase 6 (Railway deploy):** the live URL stays the same. Branding changes deploy on the next push.
- **Phase 7 (README + Postman):** the README acknowledgment-section bullet from "Success criteria" above lands in this work's commit, not as a separate doc-only commit.

## Risks

- **Self-hosted Inter file size.** Three weights × woff2 ≈ 150 KB. Comparable to Pico's ~80 KB. Acceptable for a static page, but worth mentioning.
- **Pico variable conflicts.** Pico v2 derives some component styles from `--pico-primary` _and_ `--pico-color` simultaneously; overriding `--pico-primary` to the neon may cause unexpected colouring on, for example, link underlines or hover states elsewhere. Mitigation: the manual sweep covers every interactive element; any odd render gets fixed inline.
- **Charcoal-on-neon disabled state.** `opacity: 0.5` on the disabled button reduces effective contrast — `0.5 × #151519 on #B0FB15` may drop below 4.5:1. If so, swap to a different disabled treatment (e.g. neutral grey background instead of dimmed neon). Verified during the sweep.
- **`text-muted` token derivation.** The design doc gives `#5a5a60` as the derived muted-charcoal value. If it doesn't pass contrast on Sand, adjust to `#3a3a40` or similar — document the change.
- **Eyebrow placement reading as a sub-heading instead of supporting text.** Visual hierarchy — solved by font size (≤ 0.875rem) and muted colour. Sweep step 3 confirms.
- **Reviewer perception.** The take-home brief specifies "minimal Pico defaults"; applying a full visual rebrand may read as scope creep. Mitigation: keep all backend / API / algorithm / test surfaces untouched so the brand pass is purely cosmetic and easy to roll back if a reviewer prefers Pico defaults.
