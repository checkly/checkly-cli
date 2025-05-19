import fs from 'node:fs/promises'
import path from 'path'
import { Session } from '../constructs/project'

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
    try {
      await fs.access(configPath, fs.constants.R_OK)
    } catch {
      continue
    }
    const result = await Session.loadFile(configPath)
    return result
  }
  return undefined
}
