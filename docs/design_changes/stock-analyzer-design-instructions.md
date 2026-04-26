# Stock Price Analyzer — Frontend Design Instructions

## Purpose of this document

This document tells Claude Code how to apply the brand's visual identity to the analyzer's existing frontend. The brief specifies Pico CSS + Alpine.js served by NestJS — that stack stays. The work is theming, not rebuilding.

**Read this whole document before making any changes.** The "do not" rules at the bottom are as important as the "do" rules at the top.

---

## What you're working with

- A single HTML page (likely `index.html` or similar in the static assets directory).
- Pico CSS as the base stylesheet, included via CDN or local copy.
- Alpine.js handling reactive state (selected stock, date bounds, loading flag, result).
- A small custom stylesheet (or `<style>` block) that overrides Pico where needed.

The right way to brand Pico is by overriding its CSS custom properties, not by writing parallel selectors. Pico is built around variables like `--pico-primary`, `--pico-background-color`, `--pico-color`, `--pico-font-family`, etc. Override those at the `:root` (or `[data-theme]`) level and the whole page picks up the change. **Do not** rewrite Pico's component CSS.

---

## Design tokens — apply these as CSS variables

Add these at the top of the custom stylesheet, scoped to `:root`. Use them everywhere — never hardcode the hex values inline.

```css
:root {
  /* Brand palette */
  --brand-charcoal: #151519;
  --brand-neon: #b0fb15;
  --brand-white: #ffffff;
  --brand-sand: #ebe8e0;
  --brand-indigo: #5e53e0;

  /* Surface roles */
  --surface-page: var(--brand-sand);
  --surface-card: var(--brand-white);
  --text-primary: var(--brand-charcoal);
  --text-muted: #5a5a60; /* derived; charcoal at lower contrast for helper text */
  --accent: var(--brand-neon);
  --accent-ink: var(
    --brand-charcoal
  ); /* text on neon must be charcoal, never white */
  --warning: var(--brand-indigo); /* for the DATA_GAP banner */

  /* Type scale — leading and tracking from brand guide */
  --leading-headline: 1.1; /* 110% */
  --leading-body: 1.4; /* 140% */
  --leading-eyebrow: 1; /* 100% */
  --tracking-eyebrow: 0.08em; /* 8% */
}
```

Then map these onto Pico's variables so the existing components (form fields, button) inherit the brand without you having to restyle each one:

```css
:root {
  --pico-background-color: var(--surface-page);
  --pico-color: var(--text-primary);
  --pico-primary: var(--accent);
  --pico-primary-hover: #9be612; /* slightly darker neon for hover */
  --pico-primary-inverse: var(--accent-ink);
  --pico-font-family-sans-serif: 'Inter', system-ui, -apple-system, sans-serif;
  --pico-form-element-background-color: var(--surface-card);
  --pico-form-element-border-color: var(--brand-charcoal);
  --pico-form-element-focus-color: var(--accent);
}
```

---

## Typography

Load two font families. Aeonik is paid — most likely it's not available in the project. **Inter is the substitute for Aeonik per the brand's own alternate-typefaces page**, so the stack should be:

- **Headings:** Aeonik if licensed and present, else Inter (Bold weight 700 for hero, Semi-Bold 600 for sub-headings).
- **Body:** Inter Regular (400) and Semi-Bold (600).

Load Inter from Google Fonts in the document `<head>`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  rel="stylesheet"
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
/>
```

Apply leading and tracking explicitly — Pico's defaults will not match the brand:

```css
h1,
h2,
h3 {
  line-height: var(--leading-headline);
  letter-spacing: 0;
  font-weight: 700;
}
body,
p,
label,
input,
button {
  line-height: var(--leading-body);
  letter-spacing: 0;
}
.eyebrow {
  line-height: var(--leading-eyebrow);
  letter-spacing: var(--tracking-eyebrow);
  text-transform: none; /* sentence case, never uppercase */
  font-weight: 700;
  font-size: 0.875rem;
}
```

**All copy is sentence case.** Headings, labels, button text — first letter capitalised, everything else lower except proper nouns. No Title Case, no ALL CAPS. This is a hard brand rule.

---

## Layout

A single column, left-aligned, generous whitespace. Max content width around 640px, centred horizontally on the page. Vertical rhythm is roomy — at least 1.5rem between form sections, 2rem above the headline.

The page reads top to bottom in this order: headline → stock selector → date range → funds → analyze button → result area. This matches the brief; do not reorder.

---

## The headline — stacked text-container pills

The brand's pill-as-text-container treatment is the signature graphic device, and the user wants it for the headline. Use three stacked pills, contrasting colorway (this is colorway — from page 66 of the brand guide: primary on top and bottom, secondary in the middle).

```html
<div class="headline-stack">
  <span class="pill pill--charcoal">Stock</span>
  <span class="pill pill--white">price</span>
  <span class="pill pill--neon">analyzer</span>
</div>
```

```css
.headline-stack {
  display: flex;
  flex-direction: column;
  align-items: flex-start; /* left-aligned, per brand */
  gap: 0.5rem;
  margin-bottom: 2.5rem;
}
.pill {
  display: inline-block;
  padding: 0.5rem 1.25rem; /* X = 1/2 font-size, 1.5X = 3/4 font-size, per page 65 */
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

The brand spec is that text containers are used for 3-word headlines only, one word per pill. Keep it three pills — do not add more, do not split words across pills.

---

## Form elements

Pico already styles inputs and selects reasonably; just lean on the variable overrides above. A few specifics worth enforcing:

- **Inputs and selects:** charcoal 1px border, white background, charcoal text, neon focus ring (handled by `--pico-form-element-focus-color`).
- **Border-radius on inputs:** medium rounding (~10px) — not full pill, that's reserved for the headline pills and the button.
- **Labels:** Inter Semi-Bold, charcoal, sentence case, sit above the field with ~0.4rem gap.

---

## The Analyze button

This is the call to action. Make it a **filled neon pill**, full-width on mobile, auto-width on desktop, sized larger than form inputs.

```css
button[type='submit'],
.btn-primary {
  background: var(--accent);
  color: var(--accent-ink); /* charcoal text on neon — never white */
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

Disabled state is for the in-flight period after the user clicks Analyze, per the brief.

---

## The result area

Below the button, with a clear gap (at least 2rem). Two states:

1. **Successful result.** Render the human-readable sentence from the brief in Inter Regular at the body size. Use `<strong>` (Inter Semi-Bold) on the numeric values — share count, prices, profit. Sentence case. No background card needed; sit on the Sand surface directly.

2. **No profitable trade.** Single line: "No profitable trade found in this window." Same styling, no special treatment.

3. **DATA_GAP warning banner.** When the API response includes a `warnings` array with a `DATA_GAP` entry, render a subtle banner _above_ the result. Use the secondary brand colour for restraint:

```css
.warning-banner {
  background: #eceafa; /* indigo at level 10-ish — light tint */
  color: var(--brand-charcoal);
  border-left: 3px solid var(--warning);
  padding: 0.875rem 1rem;
  border-radius: 8px;
  font-size: 0.9375rem;
  margin-bottom: 1rem;
}
```

Per the brief: not an error colour, not a modal. Calm, informational.

4. **Error state.** Render the API's `message` inline below the button in charcoal at body size. For `NO_DATA_IN_WINDOW`, append the helpful hint listing available sessions (the brief asks for this). Do not use red — the brand has no error red. A muted charcoal message is sufficient; the placement near the button is the signal.

---

## Loading state

When the request is in flight, the button is disabled (opacity 0.5) and its text changes from "Analyze" to "Analyzing…". Do not add a spinner — the brand is restrained and the disabled state is enough signal for sub-second responses. If you want motion, a single neon underline that pulses opacity 0.5 → 1 → 0.5 over 1.2s under the button is acceptable; nothing more elaborate.

---

## Do not

These are the brand rules that matter most. Violations break the visual system.

- **Do not add any brand logo, symbol, or wordmark anywhere on the page.** This is a stock analyzer project, not a branded surface. Borrow the visual _language_ (palette, type, pill shape) — not the marks.
- **Do not add graphic device backgrounds** (the stroked pills, organic circles, fill compositions from pages 51–58). Those are for marketing surfaces. The analyzer is a utility.
- **Do not introduce additional colours** beyond the tokens above. No green for success, no red for errors, no purple gradients, no shadows beyond what Pico applies subtly to inputs on focus.
- **Do not use Title Case or ALL CAPS** anywhere. Sentence case throughout — including button labels, eyebrow text, headings, table headers.
- **Do not justify or right-align text.** Left-align is the rule, with centre-alignment permitted only for the headline pills if you choose that variation (don't — left-align the pill stack).
- **Do not put white text on neon, or neon text on white.** Both fail accessibility and the brand spec. Charcoal on neon, neon on charcoal, charcoal on white, white on charcoal — those are the only text-on-colour combinations.
- **Do not add icons inside the pill text containers.** Brand spec is text only, one word per pill.
- **Do not change the headline pill colour order from charcoal-white-neon** without a reason. That ordering is the brand's "contrasting colorway" and gives the strongest read.
- **Do not warp, outline, stack-and-resize, or recolour the headline pills** (page 26-style misuse). Equal padding, consistent border-radius, three pills, that's it.

---

## Verifying you got it right

When done, the page should:

1. Load with a Sand background, three stacked pills as the headline (charcoal/white/neon, top to bottom, left-aligned).
2. Show the form below in Inter Regular, charcoal text, white input fields with charcoal borders.
3. Have a single filled-neon pill button as the only call to action.
4. Render results in plain prose below the button — no cards, no boxes, no dividers.
5. Show the `DATA_GAP` warning as a soft indigo-tinted banner when present.
6. Pass a sentence-case check: every visible string starts with a capital and is otherwise lower except proper nouns.

If any of those don't match, fix them before moving on.

---

## Files you'll likely touch

- The static `index.html` (or whatever the entrypoint is named).
- The custom stylesheet — possibly `styles.css` or a `<style>` block in `index.html`.
- Possibly the Alpine component definition if button text or class bindings need updating.

You should not need to touch the NestJS server code, the API contract, the algorithm, or the data layer. If you find yourself opening files outside the static frontend directory, stop and reconsider.
