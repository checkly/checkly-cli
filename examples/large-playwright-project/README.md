# Large Playwright project (heap-usage repro)

A deliberately large Checkly + Playwright project that emulates the reported
customer scenario: **hundreds of `PlaywrightCheck`s generated from one shared
source tree, each duplicated across several locations.** Use it to reproduce
the `checkly deploy` heap exhaustion and to verify the bundling fixes.

## What's in here

- `playwright.check.ts` — a loop that creates `CHECK_COUNT × LOCATIONS`
  `PlaywrightCheck` constructs, **all pointing at the same
  `playwright.config.ts`** and the same `./tests` + `./src` import graph.
- `playwright.config.ts` / `tests/*.spec.ts` — a real Playwright suite whose
  specs import a shared library, so bundling has to parse and resolve a genuine
  dependency graph.
- `src/lib/**` — a hand-written shared library with cross-module imports,
  re-export barrels, and a chunky data file (`src/lib/data/countries.ts`).
- `scripts/generate-lib.mjs` — generates a much larger interlinked tree under
  `src/generated/**` (plus a spec that pulls it all in) so you can scale the
  shared codebase up until the pre-fix CLI runs out of heap.

The key property: every check shares the **same** config and source tree. Before
the fix, `Project.bundle()` fanned out an unbounded `Promise.all` over every
check and each one re-parsed and re-resolved that whole shared graph
concurrently — so peak heap scaled with the number of checks. After the fix the
work is deduplicated (shared promise caches + a memoized `PlaywrightProjectBundler`)
and the fan-out is concurrency-capped.

## Reproducing / verifying without an account

`checkly debug parse-project` runs the exact heavy path —
parse → `project.bundle()` → `finalize()` → `synthesize()` — **without needing
to log in or deploy.** That's all you need to observe the heap behaviour.

### 1. Build and pack the local CLI

From the repo root:

```bash
pnpm --filter checkly run prepare
(cd packages/cli && pnpm pack)   # produces packages/cli/checkly-0.0.1-dev.tgz
```

### 2. Install the example against that local build

```bash
cd examples/large-playwright-project
npm install
npm install --no-save ../../packages/cli/checkly-0.0.1-dev.tgz
```

`npx checkly` now resolves to the freshly built CLI.

### 3. (Optional) scale the shared source tree up

```bash
# 150 interlinked modules + 4 datasets of 2500 rows each
npm run generate -- 150 2500
# undo with: npm run clean:generated
```

### 4. Parse + bundle under a constrained heap

```bash
# ~600 PlaywrightCheck constructs (200 checks × 3 locations), 768 MB heap cap
CHECK_COUNT=200 NODE_OPTIONS=--max-old-space-size=768 npx checkly debug parse-project > /dev/null
```

On the **fixed** CLI this completes. To see the old behaviour, repeat steps 1–2
from a commit *before* the bundling fixes (re-pack, re-install the tarball) and
rerun — it crashes with `JavaScript heap out of memory`. Dial the pressure with
`CHECK_COUNT`, `LOCATIONS`, the generator size, and `--max-old-space-size`.

### Measured before/after

Same inputs both runs: `npm run generate -- 200 3000` (200 interlinked modules
+ 4 datasets of 3000 rows), `CHECK_COUNT=600` (1800 PlaywrightCheck constructs),
`--max-old-space-size=1024`:

| CLI | Result | Peak RSS | Wall time |
| --- | --- | --- | --- |
| pre-fix (`main` before the bundling fixes) | **`JavaScript heap out of memory`** (exit 134) | — | crashed |
| fixed | bundles all 1800 checks (exit 0) | ~390 MB | ~2 s |

At a smaller scale where the pre-fix CLI survives (`CHECK_COUNT=300`, uncapped
heap) the gap is still stark: ~1470 MB peak RSS pre-fix versus ~380 MB fixed.

> Tip: prefix the command with `/usr/bin/time -l` (macOS) or `/usr/bin/time -v`
> (Linux) to print peak resident memory, which is handy for before/after
> comparisons even when neither run crashes.

## Deploying it for real

It's a normal Checkly project, so once you're authenticated you can also run
`npx checkly deploy` / `npx checkly deploy --preview` against it. Keep
`CHECK_COUNT` modest if you actually deploy — this is primarily a stress
fixture, not something you want hundreds of real checks from.
