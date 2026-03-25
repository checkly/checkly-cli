import { existsSync, readFileSync, writeFileSync, cpSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import chalk from 'chalk'
import prompts from 'prompts'

import { detectPackageManager } from '../../services/check-parser/package-files/package-manager'
import { makeOnCancel, successMessage } from './prompts-helpers'

// Path resolves at runtime from dist/helpers/onboarding/ to dist/ai-context/onboarding-boilerplate/
const CONFIG_TEMPLATE_PATH = join(__dirname, '../../ai-context/onboarding-boilerplate/checkly-config-template.ts')
const BOILERPLATE_CHECKS_PATH = join(__dirname, '../../ai-context/onboarding-boilerplate/__checks__')

export interface DepsInstallOptions {
  skipPrompts?: boolean
}

function sanitizeLogicalId (name: string): string {
  return name
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'checkly-project'
}

async function detectProjectPackageManager (projectDir: string): Promise<{ name: string, installCmd: string }> {
  // Skip user agent detection — when invoked via npx, it always reports npm
  // regardless of the project's actual package manager. Lockfile/config detection is reliable.
  const pm = await detectPackageManager(projectDir, { skipUserAgent: true })
  const runnable = pm.installCommand()
  return { name: pm.name, installCmd: runnable.unsafeDisplayCommand }
}

// Using direct readFileSync instead of PackageJsonFile to avoid async overhead for a known local path
function getProjectName (projectDir: string): string {
  const pkgPath = join(projectDir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
      if (pkg.name) {
        return pkg.name
      }
    } catch {
      // fall through
    }
  }
  return 'my-project'
}

function addDepsToPackageJson (projectDir: string, pkg: Record<string, any>, log: (msg: string) => void): boolean {
  const pkgPath = join(projectDir, 'package.json')
  try {
    pkg.devDependencies = pkg.devDependencies ?? {}
    pkg.devDependencies.checkly = 'latest'
    pkg.devDependencies.jiti = 'latest'
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    return true
  } catch {
    log(chalk.red('Could not update package.json — it may contain invalid JSON.'))
    return false
  }
}

export function createConfig (projectDir: string, log: (msg: string) => void): void {
  const configPath = join(projectDir, 'checkly.config.ts')
  if (existsSync(configPath)) {
    log(chalk.yellow('checkly.config.ts already exists, skipping'))
    return
  }
  let template: string
  try {
    template = readFileSync(CONFIG_TEMPLATE_PATH, 'utf-8')
  } catch {
    log(chalk.red('Could not read config template. Try reinstalling the checkly package.'))
    return
  }
  const projectName = getProjectName(projectDir)
  const logicalId = sanitizeLogicalId(projectName)
  const content = template
    .replaceAll('{{projectName}}', projectName)
    .replaceAll('{{logicalId}}', logicalId)
  writeFileSync(configPath, content)
  log(successMessage('Created checkly.config.ts'))
}

export function copyChecks (projectDir: string, log: (msg: string) => void): void {
  const checksDir = join(projectDir, '__checks__')
  if (existsSync(checksDir)) {
    log(chalk.yellow('__checks__/ already exists, skipping'))
    return
  }
  try {
    cpSync(BOILERPLATE_CHECKS_PATH, checksDir, { recursive: true })
    log(successMessage('Created __checks__/ with example checks'))
  } catch {
    log(chalk.red('Could not copy example checks.'))
  }
}

function readPackageJson (projectDir: string): Record<string, any> | null {
  const pkgPath = join(projectDir, 'package.json')
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf-8'))
  } catch {
    return null
  }
}

export async function runDepsInstall (
  projectDir: string,
  log: (msg: string) => void,
  options: DepsInstallOptions = {},
): Promise<void> {
  const pm = await detectProjectPackageManager(projectDir)
  const pkg = readPackageJson(projectDir)
  if (!pkg) {
    log(chalk.red('Could not read package.json — it may contain invalid JSON.'))
    return
  }

  // Always add checkly and jiti to package.json — even if user declines running install
  if (!addDepsToPackageJson(projectDir, pkg, log)) {
    return
  }
  log(successMessage('Added checkly and jiti to package.json'))

  if (options.skipPrompts) {
    try {
      execSync(pm.installCmd, { cwd: projectDir, stdio: 'pipe' })
      log(successMessage('Installed dependencies'))
    } catch (error: any) {
      log(chalk.red(`Failed to install dependencies. Run ${chalk.bold(pm.installCmd)} manually. ${error.message?.slice(0, 200) ?? ''}`))
    }
    return
  }

  const { install } = await prompts({
    type: 'confirm',
    name: 'install',
    message: `Run ${pm.name} install to install them now?`,
    initial: true,
  }, {
    onCancel: makeOnCancel(log),
  })

  if (install) {
    try {
      execSync(pm.installCmd, { cwd: projectDir, stdio: 'pipe' })
      log(successMessage('Installed dependencies'))
    } catch (error: any) {
      log(chalk.red(`Failed to install dependencies. Run ${chalk.bold(pm.installCmd)} manually. ${error.message?.slice(0, 200) ?? ''}`))
    }
  } else {
    log(`\nRun ${chalk.bold(pm.installCmd)} when you're ready.`)
  }
}
