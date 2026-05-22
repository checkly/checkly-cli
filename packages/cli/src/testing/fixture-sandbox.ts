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

function templateEnvKey (key: string): string {
  return `CHECKLY_FIXTURE_TEMPLATE_${key.toUpperCase()}`
}

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

    const tgzPath = path.join(CLI_PACKAGE_ROOT, 'checkly-0.0.1-dev.tgz')
    await fs.access(tgzPath)

    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
      name: `fixture-template-${key}`,
      private: true,
      dependencies: pkg.dependencies,
      devDependencies: {
        ...pkg.devDependencies,
        checkly: `file:${tgzPath}`,
      },
    }, null, 2) + '\n')

    await execa('pnpm', ['install', '--ignore-workspace'], { cwd: root })

    debug(`Fixture template '${key}' ready`)

    process.env[templateEnvKey(key)] = root

    const template = new FixtureTemplate(root)
    FixtureTemplate.#cache.set(key, template)
    return template
  }

  static use (key: string): FixtureTemplate {
    const cached = FixtureTemplate.#cache.get(key)
    if (cached) {
      return cached
    }

    const root = process.env[templateEnvKey(key)]
    if (!root) {
      throw new Error(`FixtureTemplate '${key}' not found. Create it in globalSetup first.`)
    }

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
  source?: string
  root?: string
  packageManager?: PackageManager
  template?: string
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
      template = 'bare',
    } = options

    const root = maybeRoot
      ? await fs.mkdir(maybeRoot, { recursive: true }).then(() => maybeRoot)
      : await fs.realpath(await fs.mkdtemp(path.join(tmpdir(), 'fixture-sandbox-')))

    debug(`Using root ${root}`)

    if (source) {
      debug(`Copying sources from ${source}`)
      await fs.cp(source, root, { recursive: true })
    } else {
      await fs.writeFile(path.join(root, 'package.json'), '{"private":true}\n')
    }

    const packageManager = maybePackageManager
      ?? await detectPackageManager(root)

    debug(`Detected package manager ${packageManager.name}`)

    if (template) {
      const resolvedTemplate = FixtureTemplate.use(template)
      debug(`Using fixture template '${template}' from ${resolvedTemplate.root}`)

      await fs.symlink(
        path.join(resolvedTemplate.root, 'node_modules'),
        path.join(root, 'node_modules'),
        'dir',
      )

      // Copy lockfile from template if the fixture doesn't have one
      const hasLockfile = await fs.access(path.join(root, 'pnpm-lock.yaml')).then(() => true, () => false)
      if (!hasLockfile) {
        await fs.copyFile(
          path.join(resolvedTemplate.root, 'pnpm-lock.yaml'),
          path.join(root, 'pnpm-lock.yaml'),
        )
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
  extendEnv?: boolean
  forceKillAfterDelay?: number | false
  timeout?: number
  cwd?: string
}
