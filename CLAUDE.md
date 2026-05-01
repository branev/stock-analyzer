# Working agreement

## Authoritative docs

- `docs/01-stock-analyzer-analysis.md` — rationale; read on demand.
- `docs/02-stock-analyzer-brief.md` — the contract. Spec-specific rules (rounding, error codes, throttler thresholds, response shapes, `/health` carve-out, etc.) live here.

## Workflow

- **TDD** for `src/analysis/*` and `src/data/*` only. **Test-after** for controllers, DTOs, frontend, and the mock-data generator.
- Atomic commits with terse what-and-why messages. No agent/reviewer/tool attribution in subject or body. If a message reads long, it probably is — cut.
- Never `git push` without explicit approval. Stage and commit freely; pushes wait for "push" / "go ahead and push".
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

## Reporting style

When you create or modify files, report briefly: filename, line count, summary, and any interpretive choices worth flagging. Don't paste full file contents into chat unless I explicitly ask. I'll open files myself.

## Task tracking

When a phase has a `tasks.md` with checkboxes, mark each task `[x]` as you complete it. After commit, retroactively mark any tasks that were necessarily `[ ]` at staging time (e.g. the commit task itself). Fold the retroactive update into a subsequent commit; don't make it its own commit.
