import fs from 'node:fs'
import path from 'node:path'
import semver from 'semver'
import { lineage } from './check-parser/package-files/walk.js'
import { findConfigFlag, isDevelopmentBuild, isSameDirectory, NO_DELEGATION_ENV, ownRoot } from './project-cli.js'

// Explains construct errors caused by a project importing a different checkly
// install than the one running the command: constructs then register with a
// Session the running CLI never reads. The launcher hands commands to the
// project's install to avoid this (project-cli.ts); this covers the cases it
// cannot, such as an older global CLI or CHECKLY_NO_DELEGATION=1. Everything
// here runs while an error is being reported, so it is synchronous and never
// throws.

export interface ChecklyInstall {
  dir: string
  version: string
}

/** Present in every explanation, so a message is never explained twice. */
export const TWO_INSTALLS_MARKER = 'Constructs only register with the checkly install that runs the command.'

/** The first release whose launcher hands commands to the project's install. */
const FIRST_HAND_OFF_VERSION = '10.0.0-rc.4'

function readChecklyPackage (dir: string): ChecklyInstall | undefined {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return packageJson?.name === 'checkly' ? { dir, version: String(packageJson.version) } : undefined
  } catch {
    return undefined
  }
}

/** The checkly package this module belongs to. */
export function ownInstall (): ChecklyInstall {
  const dir = path.resolve(ownRoot)
  return readChecklyPackage(dir) ?? { dir, version: 'unknown' }
}

/** The checkly package containing `file`, such as the CLI bin being run. */
export function findContainingInstall (file: string): ChecklyInstall | undefined {
  try {
    for (const dir of lineage(path.dirname(fs.realpathSync(file)))) {
      const install = readChecklyPackage(dir)
      if (install) {
        return install
      }
    }
  } catch {
    // An unresolvable path names no install.
  }
  return undefined
}

/**
 * The checkly install a bare `checkly` import in `directory` resolves to.
 * Like Node and findProjectCli, the search ends at the first
 * node_modules/checkly, even when that is not a usable checkly package.
 */
export function findResolvedInstall (directory: string): ChecklyInstall | undefined {
  for (const dir of lineage(directory)) {
    if (path.basename(dir) === 'node_modules') {
      continue
    }
    const candidate = path.join(dir, 'node_modules', 'checkly')
    if (fs.existsSync(candidate)) {
      return readChecklyPackage(candidate)
    }
  }
  return undefined
}

export function isSameInstall (a: ChecklyInstall, b: ChecklyInstall): boolean {
  try {
    return isSameDirectory(a.dir, b.dir)
  } catch {
    return path.resolve(a.dir) === path.resolve(b.dir)
  }
}

function canHandOff (version: string): boolean {
  // Development and canary builds are taken to have the hand-off.
  if (isDevelopmentBuild(version)) {
    return true
  }
  return semver.valid(version) !== null && semver.gte(version, FIRST_HAND_OFF_VERSION)
}

function displayDir (dir: string): string {
  const relative = path.relative(process.cwd(), dir)
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative) ? relative : dir
}

const describe = (install: ChecklyInstall) => `checkly ${install.version} from ${displayDir(install.dir)}`

/**
 * What went wrong when a construct from `construct` was created while
 * `running` ran the command, and what to do about it. `project` is the
 * install the project's directory resolves.
 */
export function explainTwoInstalls ({ construct, running, project }: {
  construct: ChecklyInstall
  running: ChecklyInstall
  project?: ChecklyInstall
}): string {
  if (project && isSameInstall(project, construct)) {
    // The project has one install, and another one runs the command.
    let advice = 'Run the project\'s own CLI with `npx checkly` (or your package manager\'s equivalent, '
      + 'such as `pnpm exec checkly` or `yarn checkly`)'
    if (!canHandOff(running.version)) {
      advice += ', or update this checkly to 10.0.0 or later, which runs the project\'s install automatically.'
    } else if (process.env[NO_DELEGATION_ENV] === '1') {
      advice += `. ${NO_DELEGATION_ENV}=1 is set, which stops checkly from running the project's install; `
        + 'unset it to let checkly do that.'
    } else if (process.versions.deno) {
      advice += '. On Deno, checkly does not run the project\'s install automatically.'
    } else {
      // This CLI runs the project's install when it can, so that install
      // could not be used, possibly without a report (a missing bin).
      advice += '. If that fails too, reinstall the project\'s dependencies.'
    }
    // Named by the project's path, not the real path behind a symlink.
    return `The project's files import ${describe(project)}, but ${describe(running)} runs this command. `
      + `${TWO_INSTALLS_MARKER} ${advice}`
  }

  // The project's files resolve more than one install, or none from the
  // project's directory: no CLI can load all of them.
  const projectPart = project && !isSameInstall(project, running)
    ? `, and the project's directory resolves ${describe(project)}`
    : ''
  return `This file imports ${describe(construct)}, but ${describe(running)} runs this command${projectPart}. `
    + `${TWO_INSTALLS_MARKER} Make the project resolve a single checkly install, for example by depending on `
    + 'the same checkly version in every package.'
}

/**
 * For the copy of checkly whose construct failed: the explanation when the
 * running CLI (the script Node was started with) is a different install, or
 * `undefined`.
 */
export function explainFromConstructSide (): string | undefined {
  try {
    const script = process.argv[1]
    const running = script ? findContainingInstall(script) : undefined
    const construct = ownInstall()
    if (!running || isSameInstall(running, construct)) {
      return undefined
    }
    // Commands load the project from the directory of --config, or the
    // working directory.
    const configFile = findConfigFlag(process.argv.slice(2))
    const projectDir = configFile ? path.dirname(path.resolve(configFile)) : process.cwd()
    return explainTwoInstalls({ construct, running, project: findResolvedInstall(projectDir) })
  } catch {
    return undefined
  }
}

/**
 * For the running CLI, when loading `filePath` failed because a construct was
 * created outside a project: the explanation when the file's constructs come
 * from a different install, or `undefined`.
 */
export function explainFromRunningSide (filePath: string, projectDir: string): string | undefined {
  try {
    const construct = findResolvedInstall(path.dirname(filePath))
    const running = ownInstall()
    if (!construct || isSameInstall(construct, running)) {
      return undefined
    }
    return explainTwoInstalls({ construct, running, project: findResolvedInstall(projectDir) })
  } catch {
    return undefined
  }
}
