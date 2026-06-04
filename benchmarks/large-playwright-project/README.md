# Large Playwright project (bundling stress fixture)

A deliberately oversized Checkly + Playwright project for **stress-testing and
profiling project parsing and bundling**. It generates a large number of
`PlaywrightCheck`s — hundreds to thousands — that all share a single
`playwright.config.ts` and the same source tree, then lets you watch how the
CLI's parse → bundle → synthesize pipeline behaves (time and heap usage) as you
scale the number of checks and the size of the shared codebase.

It's useful for catching performance or memory regressions in the bundler:
large projects where many checks are generated from one codebase are the
worst case for that pipeline.

## What's in here

- `playwright.check.ts` — a loop that creates `CHECK_COUNT × LOCATIONS`
  `PlaywrightCheck` constructs, **all pointing at the same
  `playwright.config.ts`** and the same `./tests` + `./src` import graph.
  (One construct per check/location pair, which maximises the number of
  constructs the bundler has to process.)
- `playwright.config.ts` / `tests/*.spec.ts` — a real Playwright suite whose
  specs import a shared library, so bundling has to parse and resolve a genuine
  dependency graph, not just a couple of files.
- `src/lib/**` — a hand-written shared library with cross-module imports,
  re-export barrels, and a chunky data file (`src/lib/data/countries.ts`).
- `scripts/generate-lib.mjs` — generates a much larger interlinked tree under
  `src/generated/**` (plus a spec that pulls it all in) so you can scale the
  shared codebase up independently of the check count.

The point of the fixture is that every check shares the **same** config and
source tree. That shared graph has to be discovered, parsed, and resolved for
the project as a whole, and the number of checks referencing it is varied
independently — which is what makes it a good probe for how parsing/bundling
cost scales with check count versus codebase size.

## Scaling knobs

- `CHECK_COUNT` (env, default `200`) — number of logical checks. Total
  constructs = `CHECK_COUNT × LOCATIONS`.
- `LOCATIONS` (env, default `us-east-1,eu-west-1,ap-southeast-1`) — comma list.
- `npm run generate -- <modules> <datasetRows>` — size of the shared source
  tree (interlinked modules + large data files). `npm run clean:generated`
  removes it.

## Running it against a local CLI build

`checkly debug parse-project` runs the parse → `project.bundle()` →
`finalize()` → `synthesize()` pipeline **without logging in or deploying**, so
it's all you need to exercise and measure the bundler.

1. Build and pack the CLI from the repo root:

   ```bash
   pnpm --filter checkly run prepare
   (cd packages/cli && pnpm pack)   # produces packages/cli/checkly-0.0.1-dev.tgz
   ```

2. Install this project against that build:

   ```bash
   cd benchmarks/large-playwright-project
   npm install
   npm install --no-save ../../packages/cli/checkly-0.0.1-dev.tgz
   ```

   `npx checkly` now resolves to the freshly built CLI.

3. (Optional) grow the shared source tree:

   ```bash
   npm run generate -- 150 2500   # 150 modules + 4 datasets of 2500 rows
   ```

4. Parse + bundle at a chosen scale:

   ```bash
   CHECK_COUNT=600 npx checkly debug parse-project > /dev/null
   ```

## Measuring time and memory

Pass `--stats` to print parse/bundle/synthesize timing and heap usage to
stderr (stdout still carries the JSON payload, so redirect it). Add
`NODE_OPTIONS=--expose-gc` to also report the retained (post-GC) live heap:

```bash
CHECK_COUNT=600 NODE_OPTIONS=--expose-gc \
  npx checkly debug parse-project --stats > /dev/null
# stderr: parse-project stats {"constructs":1801,"bundleMs":...,
#   "peakHeapUsedBytes":...,"retainedHeapBytes":...,"peakRssBytes":...}
```

To find the heap ceiling for a given scale, cap the old-space size and see
whether it completes or aborts with `JavaScript heap out of memory`:

```bash
CHECK_COUNT=600 NODE_OPTIONS=--max-old-space-size=512 \
  npx checkly debug parse-project > /dev/null
```

What to look for when interpreting the numbers:

- **Retained heap should grow roughly linearly with `CHECK_COUNT`** and only by
  a small amount per construct (each check contributes its construct, its
  bundle, and one entry in the synthesized payload). A faster-than-linear climb
  would indicate per-check work being retained that should be shared.
- **Peak heap and bundle time should track the size of the shared codebase**
  (the `generate` parameters) far more than the check count — the shared graph
  is parsed and resolved once, so adding checks that reuse it should be cheap.

## Deploying it for real

It's a normal Checkly project, so once you're authenticated you can also run
`npx checkly deploy` / `npx checkly deploy --preview`. Keep `CHECK_COUNT`
modest if you actually deploy — this is a stress fixture, not something you
want hundreds of real checks from.
