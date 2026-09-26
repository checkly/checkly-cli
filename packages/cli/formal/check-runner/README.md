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
