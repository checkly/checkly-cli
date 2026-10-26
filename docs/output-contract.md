# CLI Output Contract

How the `checkly` CLI shapes its output. This contract is normative for new
commands and for changes to existing output: follow it, or call out the
deviation explicitly in the PR.

## Streams: stdout is data, stderr is chatter

A terminal shows both streams interleaved, but scripts, CI jobs, and AI agents
read them separately — most often they pipe stdout into a parser. That only
works if stdout is predictable.

- **stdout carries the command's result only**: tables, JSON output, check
  results and final summaries, session IDs and links, confirmation and
  `dry_run` envelopes, API pass-through bodies, a mutation's confirmation
  ("Environment variable "FOO" deleted."), and an empty result ("No checks
  found.").
- **stderr carries everything else**: spinners, progress lines ("Running N
  checks…", live check summaries), banners, warnings, info notices, hints and
  next steps, streamed logs, interactive questions and the preview shown
  before them, human-readable error reports, and oclif usage errors.

Consequences:

- `checkly <cmd> --output json | jq` must parse whenever stdout is not empty:
  nothing may print to stdout ahead of or after the JSON document. A failure
  the command handles is itself a JSON document on stdout; a failure oclif
  raises (usage errors, `this.error`, uncaught exceptions) leaves stdout empty,
  so check the exit code first.
- Human-facing progress still shows in an interactive terminal (both streams
  display), so redirecting chatter to stderr changes nothing for a person
  watching the terminal.
- `2>/dev/null` silences the chatter without hiding results; `>file` captures
  a clean result document. A failure is signalled by the exit code; its
  human-readable report is on stderr.

### What renders where

| Output | Stream |
|---|---|
| `--output json` documents, list tables, API pass-through bodies | stdout |
| JSON-mode error envelopes of failures the command handles | stdout |
| Agent and CI envelopes (`confirmation_required`, `dry_run`, login status lines) | stdout |
| Check results, retry/failure details, final run summaries, session links | stdout |
| Mutation confirmations, "written to <path>" lines, empty results of list and read commands (incl. `test --list`) | stdout |
| A command's final outcome, e.g. `deploy --preview` plans or "Successfully deployed …" | stdout |
| Navigation hints in terminal- or Markdown-format output | stdout (see below) |
| Spinners (`Parsing your project`, `Bundling project resources`, …) | stderr |
| Banners and warnings (engine compatibility, stale skill, diagnostics) | stderr |
| Info notices, hints, next steps, wizard output (`init`, `import`, `create-checkly`) | stderr |
| Human-readable error reports; "no matching checks" from `test`, `trigger`, and `checks run`, whether or not it fails the command | stderr |
| Interactive questions and the preview or plan shown before a confirmation | stderr |
| `login` instructions in a terminal (URL, code, waiting notes) | stderr |
| `checkly test` live progress: "Running N checks…", live summary redraws, streamed logs, dot-reporter marks | stderr |
| oclif errors: usage errors, `this.error`, uncaught exceptions (plain text in every mode) | stderr |

Where two rows seem to apply, the wizard rule wins: `init`, `import`, and
`create-checkly` print everything a person follows along with to stderr,
including the files they create and "nothing to apply" messages. Only their
final outcome (e.g. "Your import plan has been created!" with the generated
directory, or `init`'s agent-mode JSON envelope) is on stdout. Empty results
on stdout are for list and read commands ("No checks found.").

Exceptions, kept deliberately:

- A login another command starts on its own (inline login) writes all of its
  output, agent JSON lines included, to stderr: stdout belongs to the command
  that needed the login.
- Navigation hints ("Next page: …", "Try: …") are part of the terminal- or
  Markdown-format output they follow and stay on stdout. Those formats are
  human views; scripts use `--output json`, which carries no hints.

Prompts render on stderr through `prompt` (`helpers/prompts.ts`); a lint rule
stops direct use of the `prompts` package. Commands that check whether a person
is there (`login`, `logout`, `switch`, a login another command starts, and
`create-checkly`) look for terminals on stdin and stderr, not stdout, so
`checkly login | tee` still asks. Other confirmations ask whenever the CLI runs
in interactive mode.

## Envelopes

One JSON envelope per surface, versioned by convention:

- **List commands** (`--output json`): `{ data, pagination }` where
  `pagination` is `{ page, limit, total, totalPages }` for offset paging and
  `{ nextId, length }` for cursor paging. `data` is the array of entries —
  never the raw API response. See `AGENTS.md` for details.
- **Error output in JSON mode**: `{ error, detail?, hint?, searchedAccount? }`.
- **Agent envelopes** (auth, `init`, confirmation, `--dry-run`): documents built
  around a `status` field (`success`, `action_required`,
  `confirmation_required`, `dry_run`, `error`) plus a `confirmCommand` for
  approval flows.

Do not invent new envelope shapes: extend the closest one above or propose the
change in the PR.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success. Also a declined confirmation, `--dry-run` previews, and runs whose checks passed or only degraded (a degraded check does not fail the run). A run stopped with Ctrl-C has no code of its own: it exits 1 if a result that arrived failed, and 0 otherwise. |
| 1 | Failure: a failed check or run error, no matching checks under `--fail-on-no-matching` (the default), API errors, invalid configuration. |
| 2 | Usage error (unknown flags/args, oclif parse errors), or an error a command reports through oclif's `this.error`. The message is on stderr and stdout is empty. |
| 3 | `confirmation_required` (agent and CI mode): a write command stopped for approval and printed the envelope on stdout. |
| 127 | Unknown command. |

## Notes

- Colours follow stdout: chalk decides from stdout whether to colour, for
  both streams. `2>file` from a terminal keeps colour codes in the file; set
  `FORCE_COLOR=0` for plain text.
- Non-TTY runs do **not** switch output to JSON: CI logs stay human-readable;
  only spinners and live redraws degrade to plain lines.
- Spinners are suppressed by `CHECKLY_E2E_DISABLE_FANCY_OUTPUT` and disabled
  per command when the output format would not use them (for example
  `checks run --output json`).
