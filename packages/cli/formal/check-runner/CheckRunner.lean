import Std.Data.HashSet

/-!
# Formal model of `AbstractCheckRunner` (packages/cli/src/services/abstract-check-runner.ts)

The runner schedules N checks, subscribes to an MQTT topic per run, and processes
the messages for every check (`run-start`, `result` with `ATTEMPT`/`FINAL`,
`error`, `stream-logs`) on a serial queue. Every check has a timeout timer that
fires outside the queue. The run is finished when the `CHECK_FINISHED` counter
reaches N.

This file models exactly that and explores every interleaving of

* message delivery per check (in per-check order, across checks arbitrary),
* serial queue processing, including the `await` inside `processMessage` for
  results that fetch logs or snapshots (`io = true`),
* timeout timers firing,

and checks four properties on every reachable state:

1. `finish-once`        — every check emits `CHECK_FINISHED` at most once.
2. `run-finished-sound` — when `RUN_FINISHED` fires, every check has finished.
3. `no-late-events`     — no per-check event is emitted after its `CHECK_FINISHED`.
4. `no-deadlock`        — a state without enabled actions has `RUN_FINISHED` set.

`Cfg.fixed = true` switches the model to the proposed fix: terminal results claim
the check (clear the timer) *before* awaiting, and attempt results re-check the
timer *after* awaiting.
-/

namespace CheckRunner

/-- One MQTT message for a check. `io` marks results whose processing awaits
network or disk I/O before emitting (`assets.getLogs`, snapshots, short links). -/
inductive Msg where
  | runStart
  | attempt (io : Bool)
  | final (io : Bool)
  | error
  deriving Repr, BEq, Hashable, DecidableEq

/-- Observable per-check event counters. `late` counts events emitted after the
first `CHECK_FINISHED` of that check. -/
structure Obs where
  finished : Nat := 0
  successful : Nat := 0
  failed : Nat := 0
  late : Nat := 0
  deriving Repr, BEq, Hashable, DecidableEq

/-- The queue task currently suspended at an `await`, if any. -/
inductive Inflight where
  | none
  | attempt (i : Nat)
  | final (i : Nat)
  deriving Repr, BEq, Hashable, DecidableEq, Inhabited

structure State where
  /-- Messages not yet delivered by MQTT, per check, in order. -/
  pending : List (List Msg)
  /-- The p-queue: FIFO of (check, message). -/
  queue : List (Nat × Msg)
  /-- `this.timeouts.has(sequenceId)` per check. -/
  timer : List Bool
  inflight : Inflight
  obs : List Obs
  /-- `finishedCheckCount` inside `allChecksFinished()`. -/
  finishedCount : Nat
  /-- `RUN_FINISHED` has been emitted. -/
  runFinished : Bool
  deriving Repr, BEq, Hashable, DecidableEq, Inhabited

inductive Action where
  | deliver (i : Nat) (m : Msg)
  | process (i : Nat) (m : Msg)
  | resume
  | timerFire (i : Nat)
  deriving Repr, BEq, DecidableEq

structure Cfg where
  /-- Per-check message script the backend/MQTT will deliver, in order. -/
  scripts : List (List Msg)
  /-- Model the proposed fix instead of the current code. -/
  fixed : Bool
  deriving Repr

def Cfg.n (c : Cfg) : Nat := c.scripts.length

def init (c : Cfg) : State :=
  { pending := c.scripts
    queue := []
    timer := List.replicate c.n true
    inflight := .none
    obs := List.replicate c.n {}
    finishedCount := 0
    runFinished := false }

/-! ## Semantics -/

private def updObs (s : State) (i : Nat) (f : Obs → Obs) : State :=
  let old := s.obs.getD i {}
  let new := f old
  let new := if old.finished ≥ 1 then { new with late := new.late + 1 } else new
  { s with obs := s.obs.set i new }

/-- `this.emit(Events.CHECK_FINISHED)` and the counter in `allChecksFinished()`. -/
def emitFinished (c : Cfg) (s : State) (i : Nat) : State :=
  let s := updObs s i fun o => { o with finished := o.finished + 1 }
  let cnt := s.finishedCount + 1
  { s with finishedCount := cnt, runFinished := s.runFinished || cnt == c.n }

def emitSuccess (s : State) (i : Nat) : State :=
  updObs s i fun o => { o with successful := o.successful + 1 }

def emitFailed (s : State) (i : Nat) : State :=
  updObs s i fun o => { o with failed := o.failed + 1 }

/-- `CHECK_INPROGRESS`, `CHECK_ATTEMPT_RESULT`, `STREAM_LOGS`: not terminal. -/
def emitOther (s : State) (i : Nat) : State := updObs s i id

def timerActive (s : State) (i : Nat) : Bool := s.timer.getD i false

/-- `disableTimeout(sequenceId)`. -/
def clearTimer (s : State) (i : Nat) : State := { s with timer := s.timer.set i false }

/-- Body of `processMessage` after the `timeouts.has` guard, up to the first
`await` (which becomes an `Inflight` continuation). -/
def processMsg (c : Cfg) (s : State) (i : Nat) : Msg → State
  | .runStart => emitOther s i
  | .attempt io =>
    if io then { s with inflight := .attempt i } else emitOther s i
  | .final io =>
    -- fix: claim the check before awaiting so the timer can no longer race us
    let s := if c.fixed then clearTimer s i else s
    if io then { s with inflight := .final i }
    else emitFinished c (emitSuccess (clearTimer s i) i) i
  | .error => emitFinished c (emitFailed (clearTimer s i) i) i

def step (c : Cfg) (s : State) : Action → Option State
  | .deliver i _ =>
    match s.pending.getD i [] with
    | [] => none
    | m :: rest => some { s with pending := s.pending.set i rest, queue := s.queue ++ [(i, m)] }
  | .timerFire i =>
    if timerActive s i then
      some (emitFinished c (emitFailed (clearTimer s i) i) i)
    else none
  | .process _ _ =>
    match s.inflight, s.queue with
    | .none, (i, m) :: rest =>
      let s := { s with queue := rest }
      -- `if (!this.timeouts.has(sequenceId)) return` — "already timed out"
      if !timerActive s i then some s else some (processMsg c s i m)
    | _, _ => none
  | .resume =>
    match s.inflight with
    | .none => none
    | .attempt i =>
      let s := { s with inflight := .none }
      -- fix: re-check the timer after the await before reporting an attempt
      if c.fixed && !timerActive s i then some s else some (emitOther s i)
    | .final i =>
      -- current code: no re-check after the await; emits unconditionally
      let s := { s with inflight := .none }
      some (emitFinished c (emitSuccess (clearTimer s i) i) i)

/-- All actions enabled in `s`, with their successor states. -/
def successors (c : Cfg) (s : State) : List (Action × State) :=
  let delivers := (List.range c.n).filterMap fun i =>
    match s.pending.getD i [] with
    | m :: _ => (step c s (.deliver i m)).map ((.deliver i m), ·)
    | [] => none
  let process := match s.queue with
    | (i, m) :: _ => ((step c s (.process i m)).map ((.process i m), ·)).toList
    | [] => []
  let resume := ((step c s .resume).map (.resume, ·)).toList
  let timers := (List.range c.n).filterMap fun i =>
    (step c s (.timerFire i)).map ((.timerFire i), ·)
  delivers ++ process ++ resume ++ timers

/-! ## Properties -/

def finishOnce (s : State) : Bool := s.obs.all (·.finished ≤ 1)
def runFinishedSound (s : State) : Bool := !s.runFinished || s.obs.all (·.finished ≥ 1)
def noLateEvents (s : State) : Bool := s.obs.all (·.late == 0)
def noDeadlock (c : Cfg) (s : State) : Bool := !(successors c s).isEmpty || s.runFinished

def properties (c : Cfg) (s : State) : List (String × Bool) :=
  [ ("finish-once", finishOnce s)
  , ("run-finished-sound", runFinishedSound s)
  , ("no-late-events", noLateEvents s)
  , ("no-deadlock", noDeadlock c s) ]

/-! ## Exhaustive exploration (breadth-first) -/

structure Violation where
  property : String
  trace : List Action
  state : State
  deriving Repr, Inhabited

structure Report where
  states : Nat
  violations : List Violation
  deriving Repr, Inhabited

private partial def bfs (c : Cfg) (frontier : Array (State × List Action)) (idx : Nat)
    (visited : Std.HashSet State) (found : List Violation) : Report :=
  if h : idx < frontier.size then
    let (s, rpath) := frontier[idx]
    let found := (properties c s).foldl (init := found) fun acc (name, ok) =>
      if ok || acc.any (·.property == name) then acc
      else acc ++ [{ property := name, trace := rpath.reverse, state := s }]
    let (frontier, visited) := (successors c s).foldl (init := (frontier, visited))
      fun (fr, vis) (a, s') =>
        if vis.contains s' then (fr, vis) else (fr.push (s', a :: rpath), vis.insert s')
    bfs c frontier (idx + 1) visited found
  else
    { states := idx, violations := found }

/-- Explore every reachable state of `c` and report the first trace violating
each property (breadth-first, so traces are shortest). -/
def explore (c : Cfg) : Report :=
  let s0 := init c
  bfs c #[(s0, [])] 0 (({} : Std.HashSet State).insert s0) []

def safe (c : Cfg) : Bool := (explore c).violations.isEmpty

/-! ## Scenarios -/

structure Scenario where
  name : String
  scripts : List (List Msg)
  deriving Repr, Inhabited

def scenarios : List Scenario :=
  [ { name := "2 checks, one FINAL fetches logs (failure or --verbose)"
      scripts := [[.runStart, .final true], [.runStart, .final false]] }
  , { name := "2 checks, no I/O anywhere (baseline)"
      scripts := [[.runStart, .final false], [.runStart, .final false]] }
  , { name := "2 checks, retried check with I/O attempt, other errors"
      scripts := [[.runStart, .attempt true, .final true], [.runStart, .error]] }
  , { name := "2 checks, MQTT redelivers FINAL, run-start arrives late"
      scripts := [[.runStart, .final true, .final true], [.final false, .runStart]] }
  , { name := "3 checks, mixed"
      scripts := [[.runStart, .final true], [.runStart, .attempt false, .final true], [.runStart, .error]] }
  ]

def cfgOf (sc : Scenario) (fixed : Bool) : Cfg := { scripts := sc.scripts, fixed }

/-! ## Bounded theorems (checked by evaluation) -/

/-- The current code violates `finish-once` in the smallest interesting scenario. -/
theorem current_code_double_finishes :
    (explore (cfgOf scenarios[0]! false)).violations.any (·.property == "finish-once") = true := by
  native_decide

/-- With the fix, every scenario satisfies all four properties. -/
theorem fixed_scenario_0_safe : safe (cfgOf scenarios[0]! true) = true := by native_decide
theorem fixed_scenario_1_safe : safe (cfgOf scenarios[1]! true) = true := by native_decide
theorem fixed_scenario_2_safe : safe (cfgOf scenarios[2]! true) = true := by native_decide
theorem fixed_scenario_3_safe : safe (cfgOf scenarios[3]! true) = true := by native_decide
theorem fixed_scenario_4_safe : safe (cfgOf scenarios[4]! true) = true := by native_decide

/-- Without I/O inside `processMessage` the current code is already safe: the
race needs an `await` that yields to the event loop. -/
theorem current_code_safe_without_io : safe (cfgOf scenarios[1]! false) = true := by native_decide

end CheckRunner
