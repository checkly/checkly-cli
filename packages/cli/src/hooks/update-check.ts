import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Hook, Interfaces } from '@oclif/core'
import chalk from 'chalk'

// A lightweight replacement for @oclif/plugin-warn-if-update-available. It
// uses the same cache files and environment variables, but the plugin
// resolved the npm registry and auth token (parsing every .npmrc) on every
// command, while only the background refresh needs them. That now happens in
// the refresh process.

// How long the cached dist-tags are used before they're refreshed.
const VERSION_CACHE_DAYS = 30

const UNIT_MS = {
  days: 24 * 60 * 60 * 1000,
  hours: 60 * 60 * 1000,
  minutes: 60 * 1000,
  seconds: 1000,
  milliseconds: 1,
} as const

type Unit = keyof typeof UNIT_MS

function isUnit (value: string | undefined): value is Unit {
  return value !== undefined && value in UNIT_MS
}

function versionGreaterThan (a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) > 0
}

async function mtime (file: string): Promise<Date | undefined> {
  try {
    return (await stat(file)).mtime
  } catch {
    return undefined
  }
}

/**
 * Returns the newest version from the cache if it's newer than the running
 * one and the warning wasn't shown within CHECKLY_NEW_VERSION_CHECK_FREQ.
 */
async function getNewerVersion (config: Interfaces.Config, versionFile: string, lastWarningFile: string) {
  if (config.scopedEnvVarTrue('SKIP_NEW_VERSION_CHECK')) {
    return
  }

  // Prereleases (and development builds) never warn.
  if (config.version.includes('-')) {
    return
  }

  const frequency = Number.parseInt(config.scopedEnvVar('NEW_VERSION_CHECK_FREQ') ?? '', 10)
  if (!Number.isNaN(frequency)) {
    const unitValue = config.scopedEnvVar('NEW_VERSION_CHECK_FREQ_UNIT')
    const unit = isUnit(unitValue) ? unitValue : 'minutes'
    const lastWarning = await mtime(lastWarningFile)
    if (lastWarning && Date.now() - lastWarning.getTime() < frequency * UNIT_MS[unit]) {
      return
    }
  }

  let distTags: Record<string, string>
  try {
    distTags = JSON.parse(await readFile(versionFile, 'utf8'))
  } catch {
    return
  }

  const latest = distTags[config.scopedEnvVar('NEW_VERSION_CHECK_TAG') ?? 'latest']
  if (latest && versionGreaterThan(latest.split('-', 1)[0]!, config.version.split('-', 1)[0]!)) {
    return latest
  }
}

async function refreshNeeded (config: Interfaces.Config, versionFile: string): Promise<boolean> {
  if (config.scopedEnvVarTrue('FORCE_VERSION_CACHE_UPDATE')) {
    return true
  }
  if (config.scopedEnvVarTrue('SKIP_NEW_VERSION_CHECK')) {
    return false
  }
  const updatedAt = await mtime(versionFile)
  return !updatedAt || Date.now() - updatedAt.getTime() > VERSION_CACHE_DAYS * UNIT_MS.days
}

const hook: Hook<'init'> = async function ({ config }) {
  const versionFile = join(config.cacheDir, 'version')
  const lastWarningFile = join(config.cacheDir, 'last-warning')

  const latest = await getNewerVersion(config, versionFile, lastWarningFile)
  if (latest) {
    await writeFile(lastWarningFile, '').catch(() => {})
    this.warn(
      `${config.name} update available from ${chalk.greenBright(config.version)} to ${chalk.greenBright(latest)}. `
      + 'To update, run `npm install -D checkly@latest`',
    )
  }

  if (await refreshNeeded(config, versionFile)) {
    const script = fileURLToPath(new URL('../services/refresh-latest-version.js', import.meta.url))
    const args = [script, config.name, versionFile, config.version, config.npmRegistry ?? '']
    spawn(process.execPath, args, {
      detached: !config.windows,
      stdio: 'ignore',
    }).unref()
  }
}

export default hook
