# Agent Guidelines

This repo has a lot of historical CLI surface area. Consistency still matters:
when existing commands disagree, do not copy the first nearby example blindly.
Identify the closest current precedent, make the choice explicit in the PR, and
add tests that lock in the intended shape.

## CLI Command Conventions

- New commands live under `packages/cli/src/commands/` and should follow the
  existing `AuthCommand` / oclif metadata pattern: `hidden`, `readOnly`,
  `destructive`, and `idempotent` must be intentional.
- Prefer the newest command with the same interaction model as the precedent.
  For cursor-paginated list commands, use `status-pages list` as the canonical
  current example.
- Do not invent compact table encodings that require users to know column order
  or hidden semantics. Prefer explicit columns and readable labels, even if the
  table is wider.
- If a command depends on a backend/API PR that is not merged yet, call that out
  in the PR body with a direct link and state whether the CLI PR is blocked from
  merge or release.

## List Command JSON Output

List commands should expose JSON in a stable CLI envelope instead of leaking
whatever shape the backing endpoint happens to return.

- Offset-paginated lists should use:
  `{ data, pagination: { page, limit, total, totalPages } }`
- Cursor-paginated lists should use:
  `{ data, pagination: { nextId, length } }`
- `data` should contain the list entries, not the full API response object.
- Returning the raw API body is appropriate for `get`/detail commands where the
  command is intentionally exposing one resource payload.

If an older command does not follow this yet, do not spread the inconsistency to
new commands. Either follow the canonical shape above or explain the deviation
in the PR.

## Review Checklist for CLI Additions

- Compare flag names, default limits, pagination behavior, JSON shape, and table
  layout against the closest current command before implementing.
- Add tests for REST parameter mapping, JSON output shape, empty/error paths,
  and any generated follow-up commands shown to users.
- Run focused lint, focused Vitest, `prepare:dist`, `prepack`, and a help-output
  smoke test for the new command when feasible.
