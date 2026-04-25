# Working agreement

## Authoritative docs

- `docs/01-stock-analyzer-analysis.md` — rationale; read on demand.
- `docs/02-stock-analyzer-brief.md` — the contract. Spec-specific rules (rounding, error codes, throttler thresholds, response shapes, `/health` carve-out, etc.) live here.

## Workflow

- **TDD** for `src/analysis/*` and `src/data/*` only. **Test-after** for controllers, DTOs, frontend, and the mock-data generator.
- Atomic commits with what-and-why messages.
- AAA structure for every test.
- Never bypass hooks with `--no-verify`. Fix the underlying issue.

## Code style

- Strict TypeScript. No `any` — if genuinely needed, escape with an inline comment explaining why.
- No `console.log` in production code.
- Self-documenting names; comments explain _why_, never _what_.
- Single responsibility per function.
- **Spec safety net:** read `intervalSeconds` from the data file in every index↔time calculation. Never hardcode `1`.
- Don't anticipate. No abstractions, helpers, or configurability for hypothetical future requirements. Three similar lines beats a premature abstraction.

## Dependency hygiene

- Pinned exact versions in `package.json`. Respect `min-release-age=7` in `.npmrc` (npm 11.x interprets the numeric value as days).

## When ambiguous

Propose and ask. Do not make unilateral decisions on anything not covered in the docs.
