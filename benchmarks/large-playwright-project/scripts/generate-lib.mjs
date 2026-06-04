#!/usr/bin/env node
// Generates a large, interlinked source tree under src/generated plus a spec
// that pulls the whole graph into the bundle. Use this to scale the shared
// codebase up independently of the check count when stressing the bundler.
//
//   node scripts/generate-lib.mjs [moduleCount=120] [datasetRows=2000]
//
// Each generated module imports core utilities, a large dataset module, and
// its two predecessors, so importing the highest-numbered module transitively
// pulls every other module — a deep, wide dependency graph.

import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const genDir = path.join(root, 'src', 'generated')
const testsDir = path.join(root, 'tests')

const moduleCount = Number(process.argv[2] ?? 120)
const datasetRows = Number(process.argv[3] ?? 2000)
const datasetCount = 4

const pad = n => String(n).padStart(4, '0')

await rm(genDir, { recursive: true, force: true })
await mkdir(genDir, { recursive: true })

await writeFile(
  path.join(genDir, 'types.ts'),
  'export interface DataRow {\n'
  + '  id: number\n'
  + '  key: string\n'
  + '  weight: number\n'
  + '  tags: string[]\n'
  + '}\n',
)

// Large dataset modules — big files that inflate AST and source-content memory.
for (let d = 0; d < datasetCount; d++) {
  const rows = []
  for (let r = 0; r < datasetRows; r++) {
    const tags = `['t${r % 10}', 'g${r % 25}', 'c${r % 50}']`
    rows.push(`  { id: ${r}, key: 'row-${d}-${r}', weight: ${(r * 7) % 1000}, tags: ${tags} },`)
  }
  const content =
    `import type { DataRow } from './types'\n\n`
    + `export const dataset${d}: DataRow[] = [\n${rows.join('\n')}\n]\n\n`
    + `export function sumWeights${d} (): number {\n`
    + `  return dataset${d}.reduce((acc, row) => acc + row.weight, 0)\n`
    + `}\n`
  await writeFile(path.join(genDir, `dataset-${d}.ts`), content)
}

// Interlinked feature modules.
for (let i = 0; i < moduleCount; i++) {
  const ds = i % datasetCount
  const lines = [
    `import { err, ok, Result } from '../lib/core/result'`,
    `import { Logger } from '../lib/core/logger'`,
    `import { dataset${ds}, sumWeights${ds} } from './dataset-${ds}'`,
  ]
  if (i > 0) {
    lines.push(`import { feature${i - 1} } from './mod-${pad(i - 1)}'`)
  }
  if (i > 1) {
    lines.push(`import { feature${i - 2} } from './mod-${pad(i - 2)}'`)
  }
  lines.push('')
  lines.push(`const logger = new Logger('mod-${i}')`)
  lines.push('')
  lines.push(`export function feature${i} (input: number): Result<number> {`)
  lines.push(`  logger.debug('feature${i} called with ' + input)`)
  lines.push(`  if (input < 0) {`)
  lines.push(`    return err(new Error('negative input to feature${i}'))`)
  lines.push(`  }`)
  lines.push(`  const base = sumWeights${ds}() + dataset${ds}.length`)
  if (i > 0) {
    lines.push(`  const prev = feature${i - 1}(input - 1)`)
    lines.push(`  const prevValue = prev.ok ? prev.value : 0`)
  } else {
    lines.push(`  const prevValue = 0`)
  }
  lines.push(`  return ok(base + input * ${i + 1} + prevValue)`)
  lines.push(`}`)
  await writeFile(path.join(genDir, `mod-${pad(i)}.ts`), lines.join('\n') + '\n')
}

// Barrel re-exporting everything.
const barrel = []
for (let i = 0; i < moduleCount; i++) {
  barrel.push(`export { feature${i} } from './mod-${pad(i)}'`)
}
for (let d = 0; d < datasetCount; d++) {
  barrel.push(`export { dataset${d}, sumWeights${d} } from './dataset-${d}'`)
}
await writeFile(path.join(genDir, 'index.ts'), barrel.join('\n') + '\n')

// A spec that imports the top module (pulling the whole chain) and the barrel.
const topModule = `mod-${pad(moduleCount - 1)}`
const spec =
  `import { test, expect } from '@playwright/test'\n\n`
  + `import * as generated from '../src/generated'\n`
  + `import { feature${moduleCount - 1} } from '../src/generated/${topModule}'\n\n`
  + `test('exercises the generated module graph', async () => {\n`
  + `  expect(feature${moduleCount - 1}(5).ok).toBe(true)\n`
  + `  const features = Object.keys(generated).filter(name => name.startsWith('feature'))\n`
  + `  expect(features.length).toBe(${moduleCount})\n`
  + `})\n`
await writeFile(path.join(testsDir, 'generated.spec.ts'), spec)

const totalRows = datasetCount * datasetRows
// eslint-disable-next-line no-console
console.log(
  `Generated ${moduleCount} modules + ${datasetCount} datasets `
  + `(${datasetRows} rows each, ${totalRows} rows total) under src/generated.\n`
  + `Added tests/generated.spec.ts importing the full graph.`,
)
