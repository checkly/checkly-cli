import path from 'node:path'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'

import Debug from 'debug'
import { execa } from 'execa'

import { fileURLToPath } from 'node:url'

import { detectPackageManager, PackageManager } from '../services/check-parser/package-files/package-manager.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CLI_PACKAGE_ROOT = path.resolve(__dirname, '..', '..')

const debug = Debug('checkly:cli:testing:fixture-sandbox')

export class FixtureTemplate {
  static #cache = new Map<string, FixtureTemplate>()

  readonly root: string

  private constructor (root: string) {
    this.root = root
  }

  static async create (key: string, pkg: {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }): Promise<FixtureTemplate> {
    const cached = FixtureTemplate.#cache.get(key)
    if (cached) {
      return cached
    }

    const root = await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), `fixture-template-${key}-`)))

    debug(`Creating fixture template '${key}' at ${root}`)

    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: `fixture-template-${key}`,
      private: true,
      dependencies: pkg.dependencies,
      devDependencies: pkg.devDependencies,
    }, null, 2) + '\n')

    await execa('pnpm', ['install', '--ignore-workspace'], { cwd: root })

    // Symlink the workspace CLI package so fixtures can import from 'checkly'
    const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
    await fs.symlink(CLI_PACKAGE_ROOT, path.join(root, 'node_modules', 'checkly'), symlinkType)

    debug(`Fixture template '${key}' ready`)

    const template = new FixtureTemplate(root)
    FixtureTemplate.#cache.set(key, template)
    return template
  }

  static async destroyAll (): Promise<void> {
    for (const [key, template] of FixtureTemplate.#cache) {
      debug(`Destroying fixture template '${key}'`)
      await fs.rm(template.root, { recursive: true, force: true })
    }
    FixtureTemplate.#cache.clear()
  }
}

export interface CreateFixtureSandboxOptions {
  source: string
  root?: string
  packageManager?: PackageManager
  installPackages?: boolean
  template?: FixtureTemplate
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
    const {
      source,
      root: maybeRoot,
      packageManager: maybePackageManager,
      installPackages = true,
      template,
    } = options

    const root = maybeRoot
      ? await fs.mkdir(maybeRoot, { recursive: true }).then(() => maybeRoot)
      : await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'fixture-sandbox-')))

    debug(`Using root ${root}`)
    debug(`Copying sources from ${source}`)

    await fs.cp(source, root, { recursive: true })

    const packageManager = maybePackageManager
      ?? await detectPackageManager(root)

    debug(`Detected package manager ${packageManager.name}`)

    if (template) {
      debug(`Using fixture template from ${template.root}`)

      // Symlink node_modules from the template (junction for Windows compat)
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
      await fs.symlink(
        path.join(template.root, 'node_modules'),
        path.join(root, 'node_modules'),
        symlinkType,
      )

      // Copy lockfile from template if the fixture doesn't have one
      const hasLockfile = await fs.access(path.join(root, 'pnpm-lock.yaml')).then(() => true, () => false)
      if (!hasLockfile) {
        await fs.copyFile(
          path.join(template.root, 'pnpm-lock.yaml'),
          path.join(root, 'pnpm-lock.yaml'),
        )
      }
    } else if (installPackages) {
      const { executable, args, unsafeDisplayCommand } = packageManager.installCommand()

      debug(`Installing packages via ${unsafeDisplayCommand}`)

      await execa(executable, args, { cwd: root })

      // Symlink the workspace CLI package so fixtures can import from 'checkly'
      const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
      const checklyLink = path.join(root, 'node_modules', 'checkly')
      const linkExists = await fs.access(checklyLink).then(() => true, () => false)
      if (!linkExists) {
        await fs.symlink(CLI_PACKAGE_ROOT, checklyLink, symlinkType)
      }
    } else {
      // Even without install, ensure 'checkly' is resolvable from the fixture
      const nodeModules = path.join(root, 'node_modules')
      const checklyLink = path.join(nodeModules, 'checkly')
      const linkExists = await fs.access(checklyLink).then(() => true, () => false)
      if (!linkExists) {
        await fs.mkdir(nodeModules, { recursive: true })
        const symlinkType = process.platform === 'win32' ? 'junction' : 'dir'
        await fs.symlink(CLI_PACKAGE_ROOT, checklyLink, symlinkType)
      }
    }

    return new FixtureSandbox({ root, packageManager })
  }

  async destroy (): Promise<void> {
    debug(`Destroying root ${this.#root}`)

    await fs.rm(this.#root, { recursive: true, force: true })
  }

  async run (executable: string, args: string[], options?: RunOptions) {
    const result = await execa(executable, args, {
      cwd: this.#root,
      ...options,
    })
    return result
  }

  abspath (...to: string[]): string {
    return path.join(this.#root, ...to.flatMap(segment => segment.split('/')))
  }
}

export interface RunOptions {
  env?: Record<string, string | undefined>
  timeout?: number
  cwd?: string
}
