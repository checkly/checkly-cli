import { existsSync, readFileSync, writeFileSync, cpSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'
import chalk from 'chalk'
import prompts from 'prompts'

// Path resolves at runtime from dist/helpers/onboarding/ to dist/ai-context/onboarding-boilerplate/
const CONFIG_TEMPLATE_PATH = join(__dirname, '../../ai-context/onboarding-boilerplate/checkly-config-template.ts')
const BOILERPLATE_CHECKS_PATH = join(__dirname, '../../ai-context/onboarding-boilerplate/__checks__')

export interface BoilerplateOptions {
  skipPrompts?: boolean
  configOnly?: boolean
}

function sanitizeLogicalId (name: string): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '-')
}

function detectPM (): { name: string, installCmd: string } {
  const agent = process.env.npm_config_user_agent ?? ''
  if (agent.startsWith('pnpm')) {
    return { name: 'pnpm', installCmd: 'pnpm install' }
  }
  if (agent.startsWith('yarn')) {
    return { name: 'yarn', installCmd: 'yarn install' }
  }
  if (agent.startsWith('bun')) {
    return { name: 'bun', installCmd: 'bun install' }
  }
  return { name: 'npm', installCmd: 'npm install' }
}

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

function addDepsToPackageJson (projectDir: string): void {
  const pkgPath = join(projectDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  pkg.devDependencies = pkg.devDependencies ?? {}
  pkg.devDependencies.checkly = 'latest'
  pkg.devDependencies.jiti = 'latest'
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
}

function createConfig (projectDir: string, log: (msg: string) => void): void {
  const configPath = join(projectDir, 'checkly.config.ts')
  if (existsSync(configPath)) {
    log(chalk.yellow('checkly.config.ts already exists, skipping'))
    return
  }
  const template = readFileSync(CONFIG_TEMPLATE_PATH, 'utf-8')
  const projectName = getProjectName(projectDir)
  const logicalId = sanitizeLogicalId(projectName)
  const content = template
    .replace('{{projectName}}', projectName)
    .replace('{{logicalId}}', logicalId)
  writeFileSync(configPath, content)
  log(chalk.green('✓') + ' Created checkly.config.ts')
}

function copyChecks (projectDir: string, log: (msg: string) => void): void {
  const checksDir = join(projectDir, '__checks__')
  if (existsSync(checksDir)) {
    log(chalk.yellow('__checks__/ already exists, skipping'))
    return
  }
  cpSync(BOILERPLATE_CHECKS_PATH, checksDir, { recursive: true })
  log(chalk.green('✓') + ' Created __checks__/ with example checks')
}

export async function runBoilerplateSetup (
  projectDir: string,
  log: (msg: string) => void,
  options: BoilerplateOptions = {},
): Promise<void> {
  createConfig(projectDir, log)

  if (!options.configOnly) {
    copyChecks(projectDir, log)
  }

  const pm = detectPM()

  if (options.skipPrompts) {
    addDepsToPackageJson(projectDir)
    try {
      execSync(pm.installCmd, { cwd: projectDir, stdio: 'pipe' })
      log(chalk.green('✓') + ' Installed dependencies')
    } catch {
      log(chalk.red(`Failed to install dependencies. Run ${chalk.bold(pm.installCmd)} manually.`))
    }
    return
  }

  log(`\nInstall dependencies using ${chalk.bold(pm.name)}?`)
  const { install } = await prompts({
    type: 'confirm',
    name: 'install',
    message: `Run ${chalk.bold(pm.installCmd)}?`,
    initial: true,
  })

  if (install) {
    addDepsToPackageJson(projectDir)
    try {
      execSync(pm.installCmd, { cwd: projectDir, stdio: 'pipe' })
      log(chalk.green('✓') + ' Installed dependencies')
    } catch {
      log(chalk.red(`Failed to install dependencies. Run ${chalk.bold(pm.installCmd)} manually.`))
    }
  } else {
    log(`\nTo install dependencies later, run:\n  ${chalk.bold(pm.installCmd)}`)
  }
}
