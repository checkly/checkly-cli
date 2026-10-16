#!/usr/bin/env node
/**
 * Startup budget check for CI.
 *
 * Startup performance regresses silently: any dependency that does real work
 * at module load (or an accidental eager import in a command entry's chunk
 * graph) adds cost to every invocation, forever, without failing any test.
 * This script turns today's startup time into an enforced ceiling.
 *
 * The budget is deliberately generous (local p50 is ~50ms, CI machines are
 * slower and noisier): it is a regression alarm, not a benchmark.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')
const runCjs = path.join(pkgRoot, 'bin', 'run.cjs')

const RUNS = 20
const WARMUP = 5
const P50_BUDGET_MS = 400

if (!existsSync(path.join(pkgRoot, 'dist', 'bundle'))) {
  // eslint-disable-next-line no-console
  console.error('dist/bundle is missing — run `pnpm --filter checkly run prepare` first')
  process.exit(1)
}

function runOnce () {
  const t0 = performance.now()
  const result = spawnSync(process.execPath, [runCjs, '--version'], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`--version exited with ${result.status}: ${result.stderr}`)
  }
  return performance.now() - t0
}

for (let i = 0; i < WARMUP; i++) runOnce()
const samples = []
for (let i = 0; i < RUNS; i++) samples.push(runOnce())
samples.sort((a, b) => a - b)
const p50 = samples[Math.floor(samples.length / 2)]
// eslint-disable-next-line no-console
console.log(`checkly --version p50 over ${RUNS} runs: ${p50.toFixed(1)}ms (budget ${P50_BUDGET_MS}ms)`)
if (p50 > P50_BUDGET_MS) {
  // eslint-disable-next-line no-console
  console.error(`Startup budget exceeded: p50 ${p50.toFixed(1)}ms > ${P50_BUDGET_MS}ms. Something probably added import-time work — check which chunks the command entries pull in (scripts/bundle.mjs) and what evaluates at module load.`)
  process.exit(1)
}
