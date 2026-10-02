import CheckRunner

open CheckRunner

def showMsg : Msg → String
  | .runStart => "run-start"
  | .attempt io => s!"result ATTEMPT{if io then " (fetches logs)" else ""}"
  | .final io => s!"result FINAL{if io then " (fetches logs)" else ""}"
  | .error => "error"

def showAction : Action → String
  | .deliver i m => s!"MQTT delivers {showMsg m} for check{i} (queued)"
  | .process i m => s!"queue processes {showMsg m} for check{i}"
  | .resume => "queue task resumes after await"
  | .timerFire i => s!"timeout fires for check{i}"

def showObs (obs : List Obs) : String :=
  String.intercalate ", " <| ((List.range obs.length).zip obs).map fun (i, o) =>
    s!"check{i}: finished={o.finished} ok={o.successful} failed={o.failed} late={o.late}"

def runCfg (label : String) (c : Cfg) : IO Unit := do
  let r := explore c
  IO.println s!"  [{label}] {r.states} states explored, {r.violations.length} violated properties"
  for v in r.violations do
    IO.println s!"    ✗ {v.property}"
    let mut n := 1
    for a in v.trace do
      IO.println s!"        {n}. {showAction a}"
      n := n + 1
    IO.println s!"        => {showObs v.state.obs}; finishedCount={v.state.finishedCount} runFinished={v.state.runFinished}"

def main : IO Unit := do
  IO.println "AbstractCheckRunner model check"
  for sc in scenarios do
    IO.println ""
    IO.println s!"Scenario: {sc.name}"
    runCfg "current code" (cfgOf sc false)
    runCfg "with fix    " (cfgOf sc true)
