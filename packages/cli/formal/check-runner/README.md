# Formal model of the check runner

A Lean 4 model of `src/services/abstract-check-runner.ts`: message delivery per
check, the serial processing queue with its `await` points, and the per-check
timeout timers that fire outside the queue. `CheckRunner.lean` explores every
interleaving for a handful of scenarios and checks four properties on every
reachable state:

| Property | Meaning |
|---|---|
| `finish-once` | every check emits `CHECK_FINISHED` at most once |
| `run-finished-sound` | when `RUN_FINISHED` fires, every check has finished |
| `no-late-events` | no per-check event after that check's `CHECK_FINISHED` |
| `no-deadlock` | a state with no enabled action has `RUN_FINISHED` set |

The theorems at the bottom of `CheckRunner.lean` are checked by evaluation
(`native_decide`) every time the project builds, so a model that regresses fails
the build. `report.txt` is the explorer output for the current scenarios.

## Run it

```sh
brew install elan-init          # once; installs the Lean toolchain manager
cd packages/cli/formal/check-runner
lake build                      # compiles the model and checks the theorems
lake exe check_runner_spec      # prints the violating traces per scenario
```

## Keep it honest

The model is only useful while it matches the code. When you change how
`processMessage`, the timeouts or `allChecksFinished` behave, change `processMsg`
and `step` in `CheckRunner.lean` the same way and rebuild. The unit tests in
`src/services/__tests__/abstract-check-runner.spec.ts` under "timeout racing an
in-flight result" are the traces the model found, replayed against the real code.

## Assumptions, checked against the backend

The model's message vocabulary and the fix rest on how the platform actually
behaves. Verified in the monorepo on 2026-09-25:

- `run-start` is published by the runners for every run, including retries
  (`apps/go-runner/runner/sqs_consumer.go`, `apps/runner-ng/supervisor/src/supervisor.ts`).
  `result` messages are published by the Go results daemon
  (`apps/results-daemon/pipeline/tests/handler.go`) with `resultType` set to
  `FINAL` or `ATTEMPT`; legacy browser runners can still publish `error`.
- A result is classified `ATTEMPT` only when the daemon has decided to retry
  (`apps/results-daemon/decision/get_result_type.go`). Retries are capped at
  10 and at 600 seconds of cumulative run time; the CLI sends at most 3 with
  no backoff. This is why re-arming the timeout on `ATTEMPT` keeps the wait bounded.
- The daemon publishes the `ATTEMPT` message *before* it schedules the retry,
  and a failure to schedule is logged and swallowed. An `ATTEMPT` is therefore
  a strong hint, not a guarantee, that another run follows; the re-armed
  timeout is what ends the wait if it does not.
- MQTT publishes at QoS 0. Messages can be lost but are not redelivered. The
  model still explores duplicates, which costs nothing and covers a future
  QoS change.
- The timer is the only thing that runs outside the serial queue. Everything
  else the runner does happens inside a queue task or synchronously.

The model abstracts time away, so it says nothing about the timeout length or
the re-arm itself. Those are covered by the unit tests and the e2e test
`e2e/__tests__/test-retry-timeout.spec.ts`.
