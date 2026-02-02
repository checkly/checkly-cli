import path from 'node:path'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'

import Debug from 'debug'

const debug = Debug('checkly:cli:testing:fixture-sandbox')

import { detectNearestPackageJson, detectPackageManager, PackageManager } from '../services/check-parser/package-files/package-manager'

export interface CreateFixtureSandboxOptions {
  /**
   * The fixture source directory.
   */
  source: string

  /**
   * The full, absolute path to the sandbox directory. The path will be
   * created if it does not exist.
   *
   * When the sandbox is destroyed, the path is deleted.
   *
   * If not provided, a temporary directory is created automatically.
   */
  root?: string

  /**
  * The package manager used to manage the fixture.
  *
  * If not provided, the package manager is detected automatically.
  */
  packageManager?: PackageManager

  /**
   * Whether to install packages using the package manager.
   *
   * @default true
   */
  installPackages?: boolean

  /**
   * If true, installs the packed containing package into the sandbox. Done
   * only if packages are also installed.
   *
   * @default true
   */
  injectPackedSelf?: boolean
}

interface FixtureSandboxOptions {
  packageManager: PackageManager
  root: string
}

export class FixtureSandbox {
  #root: string
  #packageManager: PackageManager

  private constructor ({ root, packageManager }: FixtureSandboxOptions) {
    this.#root = root
    this.#packageManager = packageManager
  }

  get root (): string {
    return this.#root
  }

  get packageManager (): PackageManager {
    return this.#packageManager
  }

  static async create (options: CreateFixtureSandboxOptions): Promise<FixtureSandbox> {
    const { execa } = await import('execa')

    const {
      source,
      root: maybeRoot,
      packageManager: maybePackageManager,
      installPackages = true,
      injectPackedSelf = true,
    } = options

    const root = maybeRoot
      ? await fs.mkdir(maybeRoot, { recursive: true }).then(() => maybeRoot)
      : await fs.mkdtemp(path.join(tmpdir(), 'fixture-sandbox-'))

    debug(`Using root ${root}`)

    debug(`Copying sources from ${source}`)

    await fs.cp(source, root, {
      recursive: true,
    })

    const packageManager = maybePackageManager
      ?? await detectPackageManager(root)

    debug(`Detected package manager ${packageManager.name}`)

    if (installPackages) {
      const { executable, args, unsafeDisplayCommand } = packageManager.installCommand()

      debug(`Installing packages via ${unsafeDisplayCommand}`)

      await execa(executable, args, {
        cwd: root,
      })
    }

    if (installPackages && injectPackedSelf) {
      debug('Injecting containing package')

      const lockfile = packageManager.representativeLockfile

      // Take a backup of the original package.json so that we can restore
      // it later.
      await fs.cp(
        path.join(root, 'package.json'),
        path.join(root, 'package.json.backup'),
      )

      // Same for the lockfile.
      if (lockfile) {
        await fs.cp(
          path.join(root, lockfile),
          path.join(root, `${lockfile}.backup`),
        )
      }

      const packageJson = await detectNearestPackageJson(__dirname)

      const sourcePath = path.join(
        packageJson.basePath,
        `${packageJson.name}-${packageJson.version}.tgz`,
      )

      // Make sure the archive exists.
      await fs.access(sourcePath, fs.constants.R_OK)

      const { executable, args } = packageManager.installCommand()

      await execa(executable, [...args, '--save-dev', `file:${sourcePath}`], {
        cwd: root,
      })

      // Restore original package.json.
      await fs.rename(
        path.join(root, 'package.json.backup'),
        path.join(root, 'package.json'),
      )

      // Restore original lockfile.
      if (lockfile) {
        await fs.rename(
          path.join(root, `${lockfile}.backup`),
          path.join(root, lockfile),
        )
      }
    }

    return new FixtureSandbox({
      root,
      packageManager,
    })
  }

  async destroy (): Promise<void> {
    debug(`Destroying root ${this.#root}`)

    await fs.rm(this.#root, {
      recursive: true,
      force: true,
    })
  }

  async run (executable: string, args: string[], options?: RunOptions) {
    return await run(executable, args, {
      cwd: this.#root,
      ...options,
    })
  }

  abspath (...to: string[]): string {
    return path.join(this.#root, ...to)
  }
}

async function run (executable: string, args: string[], options?: RunOptions) {
  const { execa } = await import('execa')

  const result = await execa(executable, args, {
    ...options,
  })

  return result
}

export interface RunOptions {
  env?: Record<string, string | undefined>
  timeout?: number
  cwd?: string
}
