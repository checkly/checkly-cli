import fs from 'node:fs/promises'
import path from 'node:path'

import * as acorn from 'acorn'
import * as walk from 'acorn-walk'
import Debug from 'debug'
import { parse as parseYaml } from 'yaml'

import { parseNpmrc } from '../../embedded-packages/npmrc.js'

const debug = Debug('checkly:cli:services:check-parser:pnpmfile')

/**
 * The default pnpmfile filenames pnpm looks for at the workspace root, in
 * pnpm's own precedence order: pnpm 11 loads `.pnpmfile.mjs` and falls back
 * to `.pnpmfile.cjs` only when the mjs is absent; pnpm 10 only ever loads
 * `.pnpmfile.cjs`.
 */
const PNPMFILE_FILENAMES = ['.pnpmfile.mjs', '.pnpmfile.cjs']

export function isPnpmfilePath (filePath: string): boolean {
  return PNPMFILE_FILENAMES.includes(path.basename(filePath))
}

export interface PnpmfileInfo {
  /**
   * Absolute path to the pnpmfile.
   */
  path: string

  /**
   * Why the file is not safe to include in a code bundle, when it isn't.
   * Only self-contained pnpmfiles (see {@link analyzePnpmfile}) are
   * bundleable: the remote install loads the pnpmfile before any
   * dependencies are installed and in a different environment, so a
   * pnpmfile that depends on anything outside its own bytes would turn
   * today's silent lockfile re-resolution into a hard remote install
   * failure. `undefined` means the file is bundleable.
   */
  skipReason?: string
}

/**
 * Node.js builtins a bundled pnpmfile may load. Deliberately a small
 * allowlist of side-effect-free modules: anything that touches the
 * filesystem, environment, network or child processes (fs, child_process,
 * module, os, http, ...) can make the pnpmfile behave differently — or
 * throw — on the remote runner, where only the pnpmfile's own bytes are
 * guaranteed to be present.
 */
const SAFE_BUILTIN_MODULES = new Set([
  'assert',
  'buffer',
  'crypto',
  'events',
  'path',
  'punycode',
  'querystring',
  'string_decoder',
  'url',
  'util',
])

function isSafeBuiltinModule (specifier: string): boolean {
  const bare = specifier.startsWith('node:') ? specifier.slice('node:'.length) : specifier
  return SAFE_BUILTIN_MODULES.has(bare)
}

/**
 * Identifiers whose mere presence makes a pnpmfile environment-dependent:
 * dynamic module access (`require` in non-call positions, `require.resolve`),
 * filesystem-relative paths (`__dirname`, `__filename`), process state
 * (`process.env`, `process.cwd()`) — also reachable via `globalThis.process`
 * and friends — or code evaluation (`eval`, `Function('...')`).
 */
const HAZARDOUS_IDENTIFIERS = new Set([
  '__dirname',
  '__filename',
  'process',
  'eval',
  'Function',
  'globalThis',
  'global',
])

/**
 * Best-effort static analysis of whether a pnpmfile is self-contained:
 * parseable, loads nothing beyond {@link SAFE_BUILTIN_MODULES}, and
 * references none of {@link HAZARDOUS_IDENTIFIERS}. Returns undefined when
 * the file is self-contained, or a human-readable reason when it is not
 * (or cannot be confidently analyzed).
 *
 * The analysis assumes a non-adversarial author: it exists to catch a
 * user's own accidentally environment-dependent code, not deliberate
 * obfuscation. Reflective escape hatches (e.g. reaching the Function
 * constructor through a `.constructor` property, or any computed member
 * access) are deliberately not chased — a rule broad enough to close them
 * would false-positive on ubiquitous pnpmfile patterns like
 * `pkg.dependencies[name]` and silently cost users both pnpmfile bundling
 * and lockfile pruning.
 */
function analyzePnpmfile (contents: string, filename: string): string | undefined {
  const sourceType = filename.endsWith('.mjs') ? 'module' : 'script'

  let program: acorn.Program
  try {
    program = acorn.parse(contents, {
      ecmaVersion: 'latest',
      sourceType,
      allowReturnOutsideFunction: true,
    })
  } catch {
    return `could not parse '${filename}'`
  }

  const problems = new Set<string>()

  const recordSource = (node: any) => {
    if (node && node.type === 'Literal' && typeof node.value === 'string') {
      if (!isSafeBuiltinModule(node.value)) {
        problems.add(`loads '${node.value}'`)
      }
    } else {
      problems.add('loads a dynamically computed module')
    }
  }

  walk.ancestor(program, {
    CallExpression (node: any) {
      if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
        recordSource(node.arguments[0])
      }
    },
    ImportExpression (node: any) {
      recordSource(node.source)
    },
    ImportDeclaration (node: any) {
      recordSource(node.source)
    },
    ExportNamedDeclaration (node: any) {
      if (node.source) {
        recordSource(node.source)
      }
    },
    ExportAllDeclaration (node: any) {
      recordSource(node.source)
    },
    // Note: acorn-walk only visits Identifiers in reference positions —
    // non-computed member properties (`obj.process`) and object literal
    // keys (`{ process: 1 }`) are never passed to this visitor, so property
    // names are not mistaken for references.
    Identifier (node: any, _state: any, ancestors: any[]) {
      if (HAZARDOUS_IDENTIFIERS.has(node.name)) {
        problems.add(`references '${node.name}'`)
        return
      }
      if (node.name === 'require') {
        // A plain `require('specifier')` call is handled above; any other
        // use (`require.resolve`, passing `require` around) defeats static
        // analysis.
        const parent = ancestors[ancestors.length - 2]
        if (!(parent?.type === 'CallExpression' && parent.callee === node)) {
          problems.add(`uses 'require' outside a plain require('...') call`)
        }
      }
    },
    MemberExpression (node: any) {
      // `module.exports` is the standard CJS export, but any other member
      // access on `module` (`module.require(...)`, `module['require']`) is a
      // dynamic-module-access escape hatch.
      if (node.object.type === 'Identifier' && node.object.name === 'module') {
        if (node.computed || node.property.name !== 'exports') {
          problems.add(`accesses 'module' beyond 'module.exports'`)
        }
      }
    },
    MetaProperty (node: any) {
      // Only `import.meta` is environment-dependent; `new.target` is plain
      // language semantics.
      if (node.meta?.name === 'import') {
        problems.add(`references 'import.meta'`)
      }
    },
  })

  if (problems.size > 0) {
    return `'${filename}' is not self-contained: ${Array.from(problems).join('; ')}`
  }
}

async function readTextFileIfPresent (filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined
    }
    throw err
  }
}

interface PnpmfileSettings {
  /**
   * Whether pnpmfiles are disabled via the `ignore-pnpmfile` setting.
   */
  ignored: boolean

  /**
   * Custom pnpmfile paths from the `pnpmfile` setting. When set, pnpm does
   * not load the default pnpmfiles at all.
   */
  customPaths: string[]
}

/**
 * Reads pnpm's `pnpmfile` and `ignore-pnpmfile` settings, which can be set
 * in the workspace root's `.npmrc` or in `pnpm-workspace.yaml`.
 */
async function readPnpmfileSettings (
  rootPath: string,
  configFilePath?: string,
): Promise<PnpmfileSettings> {
  const npmrc = await readTextFileIfPresent(path.join(rootPath, '.npmrc'))
  if (npmrc !== undefined) {
    const config = parseNpmrc(npmrc)
    if (config.get('ignore-pnpmfile') === 'true') {
      return { ignored: true, customPaths: [] }
    }
    const value = config.get('pnpmfile')
    if (value !== undefined && value !== '') {
      return { ignored: false, customPaths: [value] }
    }
  }

  if (configFilePath !== undefined && path.basename(configFilePath) === 'pnpm-workspace.yaml') {
    const contents = await readTextFileIfPresent(configFilePath)
    if (contents !== undefined) {
      try {
        const parsed = parseYaml(contents)
        if (parsed?.ignorePnpmfile === true || parsed?.['ignore-pnpmfile'] === true) {
          return { ignored: true, customPaths: [] }
        }
        const value = parsed?.pnpmfile
        if (typeof value === 'string' && value !== '') {
          return { ignored: false, customPaths: [value] }
        }
        if (Array.isArray(value)) {
          return {
            ignored: false,
            customPaths: value.filter(entry => typeof entry === 'string' && entry !== ''),
          }
        }
      } catch {
        // An unparseable pnpm-workspace.yaml is not this function's problem;
        // treat it as not configuring pnpmfiles.
      }
    }
  }

  return { ignored: false, customPaths: [] }
}

/**
 * Discovers the pnpmfile pnpm would use for the workspace and determines
 * whether it can be bundled. Mirrors pnpm's own resolution:
 *
 * - Bundling only matters — and is only safe — when the lockfile records a
 *   `pnpmfileChecksum`: without one there is nothing for the remote install
 *   to reproduce, and shipping a pnpmfile alongside a lockfile that does
 *   not record its checksum would itself make pnpm treat the lockfile as
 *   out of date. When the lockfile records no checksum, no pnpmfiles are
 *   reported at all (no bundling, no warnings).
 * - When the `pnpmfile` setting points at custom paths, pnpm loads those
 *   and ignores the default filenames. Custom paths are reported as
 *   non-bundleable (except a single setting that just names a default
 *   file at the root, which is treated like the default).
 * - Otherwise the default filenames apply. When both `.pnpmfile.mjs` and
 *   `.pnpmfile.cjs` exist, the effective file depends on the pnpm version
 *   (pnpm 11 loads only the mjs, pnpm 10 only the cjs), so the situation
 *   is ambiguous and both are skipped.
 *
 * Never throws: any inspection error is reported as a skip reason so that
 * workspace detection keeps working for commands that never bundle.
 */
export async function loadWorkspacePnpmfiles (
  rootPath: string,
  configFilePath?: string,
  lockfilePath?: string,
): Promise<PnpmfileInfo[]> {
  if (lockfilePath !== undefined) {
    try {
      const lockfileContent = await readTextFileIfPresent(lockfilePath)
      if (lockfileContent === undefined || !/^pnpmfileChecksum:/m.test(lockfileContent)) {
        debug(`lockfile '%s' records no pnpmfileChecksum; not bundling any pnpmfile`, lockfilePath)
        return []
      }
    } catch (err) {
      return [{
        path: rootPath,
        skipReason: `failed to inspect the lockfile for a pnpmfile checksum: ${(err as Error).message}`,
      }]
    }
  }

  let settings: PnpmfileSettings
  try {
    settings = await readPnpmfileSettings(rootPath, configFilePath)
  } catch (err) {
    // A failure to read the configuration (e.g. an unreadable .npmrc) makes
    // the effective pnpmfile unknowable; use the workspace root as the
    // entry's path since no specific pnpmfile can be named.
    return [{
      path: rootPath,
      skipReason: `failed to inspect the workspace's pnpmfile configuration: ${(err as Error).message}`,
    }]
  }

  if (settings.ignored) {
    // pnpm loads no pnpmfile at all when `ignore-pnpmfile` is set, and the
    // setting's config file travels with the bundle, so the remote install
    // ignores pnpmfiles the same way.
    return []
  }

  let filenames = PNPMFILE_FILENAMES
  if (settings.customPaths.length > 0) {
    const defaultAtRoot = settings.customPaths.length === 1
      ? PNPMFILE_FILENAMES.find(filename => {
          return path.resolve(rootPath, settings.customPaths[0]) === path.join(rootPath, filename)
        })
      : undefined

    if (defaultAtRoot === undefined) {
      return settings.customPaths.map(setting => ({
        path: path.resolve(rootPath, setting),
        skipReason: `the 'pnpmfile' setting points at a custom path (${setting}), `
          + `which is not supported for bundling`,
      }))
    }

    // The setting just names a default file at the root; treat it like the
    // default (pnpm loads exactly that file).
    filenames = [defaultAtRoot]
  }

  const infos: PnpmfileInfo[] = []
  const present: { filename: string, contents: string }[] = []
  for (const filename of filenames) {
    const filePath = path.join(rootPath, filename)
    let contents: string | undefined
    try {
      contents = await readTextFileIfPresent(filePath)
    } catch (err) {
      infos.push({
        path: filePath,
        skipReason: `failed to inspect '${filename}': ${(err as Error).message}`,
      })
      continue
    }
    if (contents !== undefined) {
      present.push({ filename, contents })
    }
  }

  if (present.length > 1) {
    infos.push(...present.map(({ filename }) => ({
      path: path.join(rootPath, filename),
      skipReason: `both ${present.map(f => `'${f.filename}'`).join(' and ')} exist, and the one `
        + `pnpm loads depends on the pnpm version`,
    })))
    return infos
  }

  infos.push(...present.map(({ filename, contents }) => ({
    path: path.join(rootPath, filename),
    skipReason: analyzePnpmfile(contents, filename),
  })))
  return infos
}
