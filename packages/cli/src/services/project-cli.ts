import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Command, Config } from '@oclif/core'
import { normalizeArgv } from '@oclif/core/help'
import Debug from 'debug'
import semver from 'semver'
import { defaultFilenames } from './checkly-config-filenames.js'

const debug = Debug('checkly:cli:project-cli')

/**
 * Set to `1` to always run the invoked CLI, even when the project has its own
 * `checkly` install.
 */
export const NO_DELEGATION_ENV = 'CHECKLY_NO_DELEGATION'

/**
 * The install a hand-off started, set in its environment. That install never
 * hands off to itself again, while a checkly it starts for another project
 * still can.
 */
const HANDED_OFF_TO_ENV = 'CHECKLY_HANDED_OFF_TO'

export interface ProjectCli {
  /** The install's directory as found, i.e. `<dir>/node_modules/checkly`. */
  dir: string
  version: string
  binPath: string
}

/** The command `args` invoke, and the arguments that follow its id. */
export function findInvokedCommand (
  config: Config,
  args: string[],
): { command: Command.Loadable, rest: string[] } | undefined {
  // normalizeArgv may rewrite the array it is given.
  const [id, ...rest] = normalizeArgv(config, [...args])
  const command = id === undefined ? undefined : config.findCommand(id)
  return command && { command, rest }
}

/**
 * The value of a string flag in raw command arguments, in any form oclif
 * accepts: `--name v`, `--name=v`, `-c v`, `-c=v` and `-cv`.
 */
export function findFlagValue (args: string[], name: string, char?: string): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--') {
      break
    }
    if (arg === `--${name}` || (char && arg === `-${char}`)) {
      return args[i + 1]
    }
    if (arg.startsWith(`--${name}=`)) {
      return arg.slice(name.length + 3)
    }
    if (char && arg.startsWith(`-${char}`) && !arg.startsWith('--')) {
      const value = arg.slice(2)
      return value.startsWith('=') ? value.slice(1) : value
    }
  }

  return undefined
}

async function exists (filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/** Resolves to `undefined` when the file does not exist; throws on any other error. */
async function readJsonIfExists (filePath: string): Promise<any> {
  let content: string
  try {
    content = await fs.readFile(filePath, 'utf8')
  } catch (err: any) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') {
      return undefined
    }
    throw err
  }
  return JSON.parse(content)
}

/**
 * The `checkly` install that a bare `checkly` import in `directory` resolves
 * to: the nearest `node_modules/checkly`, searched upwards like Node does.
 * NODE_PATH and global folders are deliberately not searched, because ES
 * module resolution of the project's files never uses them. Throws when a
 * candidate's package.json cannot be read, rather than skipping past the
 * install the project's imports would resolve to.
 */
export async function findProjectCli (directory: string): Promise<ProjectCli | undefined> {
  let current = path.resolve(directory)
  while (true) {
    if (path.basename(current) !== 'node_modules') {
      const dir = path.join(current, 'node_modules', 'checkly')
      const packageJson = await readJsonIfExists(path.join(dir, 'package.json'))
      if (packageJson) {
        if (packageJson.name !== 'checkly') {
          debug('%s is not the checkly package', dir)
          return undefined
        }
        const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.checkly
        if (typeof bin !== 'string') {
          debug('%s has no checkly bin', dir)
          return undefined
        }
        const binPath = path.join(dir, bin)
        if (!await exists(binPath)) {
          debug('the checkly bin of %s is missing at %s', dir, binPath)
          return undefined
        }
        return { dir, version: String(packageJson.version), binPath }
      }
    }

    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

async function isSameDirectory (a: string, b: string): Promise<boolean> {
  const [realA, realB] = await Promise.all([fs.realpath(a), fs.realpath(b)])
  // Windows paths compare case-insensitively; realpath can return either
  // casing of a drive letter or folder name.
  return process.platform === 'win32'
    ? realA.toLowerCase() === realB.toLowerCase()
    : realA === realB
}

/**
 * The project's own CLI to run `args` with instead of this one, if any.
 *
 * Commands marked `parsesProject` import the project's config and check
 * files. The constructs in them register with the `Session` of the `checkly`
 * install the project resolves, so only that install can run the command:
 * when this CLI is another install (global, `pnpx`, an `npx` of another
 * version), its `Session` would never see them.
 */
export async function findProjectCliHandOff (config: Config, args: string[]): Promise<ProjectCli | undefined> {
  if (process.env[NO_DELEGATION_ENV] === '1') {
    debug('hand-off disabled via %s=1', NO_DELEGATION_ENV)
    return undefined
  }

  if (process.versions.deno) {
    // A child started from process.execPath would run without the
    // permission flags given to the outer `deno run`.
    debug('hand-off not supported on Deno')
    return undefined
  }

  const invoked = findInvokedCommand(config, args)
  if (!invoked?.command.parsesProject) {
    return undefined
  }

  // Help runs no project code, so it needs no hand-off; and it should not
  // start code from a project's node_modules either.
  const flags = invoked.rest.includes('--') ? invoked.rest.slice(0, invoked.rest.indexOf('--')) : invoked.rest
  if (flags.includes('--help') || flags.includes('-h')) {
    return undefined
  }

  // Commands read the --config file, or a default config file in the
  // working directory. Without one there is no project whose files would be
  // imported, and nothing to hand off for.
  const configFlag = findFlagValue(invoked.rest, 'config', invoked.command.flags.config?.char)
  const configFiles = configFlag
    ? [path.resolve(configFlag)]
    : defaultFilenames.map(filename => path.resolve(filename))
  const hasConfigFile = (await Promise.all(configFiles.map(exists))).includes(true)
  if (!hasConfigFile) {
    debug('no Checkly config file found')
    return undefined
  }
  const projectDirectory = path.dirname(configFiles[0])

  const projectCli = await findProjectCli(projectDirectory)
  if (!projectCli) {
    debug('no checkly install found from %s', projectDirectory)
    return undefined
  }

  if (await isSameDirectory(projectCli.dir, config.root)) {
    debug('running from the project\'s install at %s', projectCli.dir)
    return undefined
  }

  const handedOffTo = process.env[HANDED_OFF_TO_ENV]
  if (handedOffTo && await isSameDirectory(projectCli.dir, handedOffTo).catch(() => false)) {
    debug('already handed off to %s', projectCli.dir)
    return undefined
  }

  return projectCli
}

const forwardedSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP']

function startFailed (config: Config, err: Error): false {
  process.stderr.write(
    `Could not start the checkly install of this project (${err.message}); running checkly ${config.version}.\n`,
  )
  return false
}

const isInspectorFlag = (arg: string) => /^--(inspect|debug)/.test(arg)

/**
 * Node options for the project's CLI: this process's, minus inspector flags,
 * which would make the child compete with this process for the debugger
 * port. Use CHECKLY_NO_DELEGATION=1 to debug a hand-off case.
 */
export function childNodeOptions (
  execArgv: string[],
  nodeOptions: string | undefined,
): { execArgv: string[], nodeOptions: string | undefined } {
  return {
    execArgv: execArgv.filter(arg => !isInspectorFlag(arg)),
    nodeOptions: nodeOptions?.split(/\s+/).filter(arg => arg && !isInspectorFlag(arg)).join(' '),
  }
}

function versionNotice (projectCli: ProjectCli, config: Config): string | undefined {
  if (projectCli.version === config.version) {
    return undefined
  }
  const displayDir = path.relative(process.cwd(), projectCli.dir) || projectCli.dir
  const notice = `Using checkly ${projectCli.version} from this project (${displayDir}) `
    + `instead of checkly ${config.version}.`
  // Only worth acting on when the invoked version is the newer one.
  return semver.valid(config.version) && semver.valid(projectCli.version)
    && semver.gt(config.version, projectCli.version)
    ? `${notice} To use ${config.version}, install it in this project.`
    : notice
}

/**
 * Runs `args` with the project's own CLI when {@link findProjectCliHandOff}
 * finds one, and exits with its exit status. Resolves to `false` when this
 * CLI should run the command itself.
 */
export async function runWithProjectCli (config: Config, args: string[]): Promise<boolean> {
  let projectCli: ProjectCli | undefined
  try {
    projectCli = await findProjectCliHandOff(config, args)
  } catch (err) {
    // Nothing has been handed off yet, so the command can still run here.
    debug('looking for the project\'s checkly install failed: %O', err)
    process.stderr.write(
      `Could not read the checkly install of this project (${(err as Error).message}); `
      + `running checkly ${config.version}.\n`,
    )
    return false
  }
  if (!projectCli) {
    return false
  }

  debug('handing off to checkly %s at %s', projectCli.version, projectCli.dir)
  const notice = versionNotice(projectCli, config)
  if (notice) {
    process.stderr.write(`${notice}\n`)
  }

  let child: ReturnType<typeof spawn>
  try {
    // With the environment including .env values: installs before 8.0.0
    // do not load .env themselves, and later ones never override a set key.
    const { execArgv, nodeOptions } = childNodeOptions(process.execArgv, process.env.NODE_OPTIONS)
    const env: NodeJS.ProcessEnv = { ...process.env, [HANDED_OFF_TO_ENV]: projectCli.dir }
    if (nodeOptions === undefined) {
      delete env.NODE_OPTIONS
    } else {
      env.NODE_OPTIONS = nodeOptions
    }
    child = spawn(process.execPath, [...execArgv, projectCli.binPath, ...args], { stdio: 'inherit', env })
  } catch (err) {
    return startFailed(config, err as Error)
  }

  // Keep this process alive until the child exits. A Ctrl+C in a terminal
  // reaches both processes; the forwarded copy is a duplicate the CLI's
  // SIGINT handling ignores. Signals sent to this process alone (a CI runner
  // stopping a job) only reach the child through the forwarding. On Windows
  // console events already reach the child, and kill() would terminate it
  // outright, so nothing is forwarded there.
  const forward = (signal: NodeJS.Signals) => {
    if (process.platform !== 'win32' && child.pid !== undefined) {
      child.kill(signal)
    }
  }
  for (const signal of forwardedSignals) {
    process.on(signal, forward)
  }
  const stopForwarding = () => {
    for (const signal of forwardedSignals) {
      process.off(signal, forward)
    }
  }

  const result = await new Promise<{ code: number | null, signal: NodeJS.Signals | null } | Error>(resolve => {
    child.once('error', resolve)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  stopForwarding()

  if (result instanceof Error) {
    // The child never started (spawn errors precede any output of its own).
    return startFailed(config, result)
  }

  if (result.signal) {
    // Exit the way the child did, so callers see the same signal.
    process.kill(process.pid, result.signal)
    return true
  }
  process.exit(result.code ?? 1)
}
