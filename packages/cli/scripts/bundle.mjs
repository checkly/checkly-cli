#!/usr/bin/env node
/**
 * Bundles the compiled tsc output in dist/ into dist/bundle/ (a Shopify-style
 * bundle, adapted for lazy command loading):
 *
 * - One ESM entry per oclif command (mirroring dist/commands/**), plus small
 *   entries for the CLI bootstrap, hooks, the help class and the public API
 *   surface. esbuild code splitting puts shared modules in dist/bundle/chunks,
 *   so a command entry only loads the chunks it actually uses — a run of
 *   `checkly env ls` never evaluates the mqtt or archiver graphs.
 * - oclif discovers commands with its default pattern strategy from
 *   dist/bundle/commands (see oclif.commands in package.json), exactly as it
 *   did from dist/commands before bundling. Loading stays lazy: no command
 *   module is evaluated until one is actually needed.
 *
 * Only native or resolution-sensitive dependencies stay external:
 * - oxc-parser: Rust native bindings resolved per platform at runtime.
 * - @typescript-eslint/typescript-estree: a peer-dependent parser that
 *   resolves the *user's project's* TypeScript via createRequire, so it must
 *   stay an installed runtime dependency.
 * - jiti: lazy-requires sibling files from its own package at runtime
 *   (e.g. dist/babel.cjs), which cannot be satisfied from a bundle.
 * - typescript: never bundled (peer of the above, resolved from the user's
 *   project when needed).
 */
import { build } from 'esbuild'
import { readdirSync, rmSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkgRoot = path.resolve(__dirname, '..')
const outDir = path.join(pkgRoot, 'dist', 'bundle')

function walk (dir, base = dir) {
  const entries = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue
      entries.push(...walk(path.join(dir, entry.name), base))
    } else if (entry.name.endsWith('.js') && !entry.name.endsWith('.d.js') && !entry.name.endsWith('.js.map')) {
      entries.push(path.join(dir, entry.name))
    }
  }
  return entries
}

const commandFiles = walk(path.join(pkgRoot, 'dist', 'commands'))

const entryPoints = [
  // The CLI bootstrap that bin/launch.cjs imports (dotenv + oclif execute).
  { in: 'dist/cli.js', out: 'cli' },
  // Hooks and the help class, wired up by oclif.hooks / oclif.helpClass in
  // package.json.
  { in: 'dist/hooks/command-not-found.js', out: 'hooks/command-not-found' },
  { in: 'dist/hooks/parse-error.js', out: 'hooks/parse-error' },
  { in: 'dist/hooks/check-update.js', out: 'hooks/check-update' },
  { in: 'dist/help/help-extension.js', out: 'help/help-extension' },
  // The public API surface (package.json "exports").
  { in: 'dist/index.js', out: 'index' },
  { in: 'dist/constructs/index.js', out: 'constructs' },
  { in: 'dist/loader/index.js', out: 'loader' },
  { in: 'dist/util/index.js', out: 'util' },
  // One entry per command, mirroring the dist/commands layout so oclif's
  // pattern strategy derives the same command IDs as before bundling.
  ...commandFiles.map(file => ({
    in: path.relative(pkgRoot, file),
    out: path.join('commands', path.relative(path.join(pkgRoot, 'dist', 'commands'), file).replace(/\.js$/, '')),
  })),
]

rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const result = await build({
  absWorkingDir: pkgRoot,
  entryPoints,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22.13',
  splitting: true,
  outdir: 'dist/bundle',
  // Shared code goes to dist/bundle/chunks/ so oclif's command glob over
  // dist/bundle/commands only ever sees command entries.
  chunkNames: 'chunks/[name]-[hash]',
  // Runtime code relies on Function.name: the deploy preview prints
  // construct.constructor.name (e.g. "ApiCheck"), and error messages and
  // write-back checks name construct classes too. Without keepNames, esbuild
  // renames classes whose name collides with their export binding in chunk
  // scope (ApiCheck = class _ApiCheck), which leaks the renamed identifier
  // into user-visible output. keepNames restores the source names.
  keepNames: true,
  // Bundled CJS dependencies (e.g. supports-color via debug) call require()
  // for node builtins at runtime. esbuild's ESM output can only resolve those
  // when a require function exists in scope; this banner supplies one.
  banner: {
    js: [
      'import { createRequire as __bannerCreateRequire } from \'node:module\'',
      'const require = __bannerCreateRequire(import.meta.url)',
    ].join('\n'),
  },
  external: ['oxc-parser', '@typescript-eslint/typescript-estree', 'jiti', 'typescript'],
  metafile: true,
  logLevel: 'warning',
})

let commandEntriesCount = 0
let bytes = 0
for (const [file, meta] of Object.entries(result.metafile.outputs)) {
  bytes += meta.bytes
  if (file.includes('/commands/')) commandEntriesCount++
}
// eslint-disable-next-line no-console
console.log(`Bundle: ${entryPoints.length} entries (${commandEntriesCount} commands), ${Object.keys(result.metafile.outputs).length} files, ${(bytes / 1e6).toFixed(1)} MB`)
