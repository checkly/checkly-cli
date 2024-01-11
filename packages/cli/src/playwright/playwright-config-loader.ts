import path from 'path'
import { loadFile } from '../services/checkly-config-loader'
import fs from 'fs'

export async function loadPlaywrightConfig () {
  let config
  const filenames = ['playwright.config.ts', 'playwright.config.js']
  for (const configFile of filenames) {
    if (!fs.existsSync(path.resolve(path.dirname(configFile)))) {
      continue
    }
    const dir = path.resolve(path.dirname(configFile))
    config = await loadFile(path.join(dir, configFile))
    if (config) {
      break
    }
  }
  return config
}
