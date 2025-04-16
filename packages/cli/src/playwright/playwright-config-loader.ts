import fs from 'fs'
import path from 'path'
import { loadFile } from '../services/util'

export async function loadPlaywrightConfig () {
  const filenames = [
    'playwright.config.ts',
    'playwright.config.mts',
    'playwright.config.cts',
    'playwright.config.js',
    'playwright.config.mjs',
    'playwright.config.cjs',
  ]
  for (const configFile of filenames) {
    const configPath = path.resolve(configFile)
    if (!fs.existsSync(configPath)) {
      continue
    }
    const result = await loadFile(configPath)
    return result
  }
  return undefined
}
