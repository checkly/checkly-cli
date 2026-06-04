#!/usr/bin/env node
// Removes everything produced by generate-lib.mjs.

import { rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

await rm(path.join(root, 'src', 'generated'), { recursive: true, force: true })
await rm(path.join(root, 'tests', 'generated.spec.ts'), { force: true })

// eslint-disable-next-line no-console
console.log('Removed src/generated and tests/generated.spec.ts.')
