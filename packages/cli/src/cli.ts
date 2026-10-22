/**
 * The bundled CLI bootstrap entry: bin/run.cjs → bin/launch.cjs → this module
 * (compiled and esbuild-bundled to dist/bundle/cli.js).
 *
 * Commands are discovered by oclif's default pattern strategy from the
 * per-command bundles in dist/bundle/commands (see oclif.commands in
 * package.json), so — exactly as before bundling — no command module is
 * evaluated until one is actually needed. This entry deliberately imports
 * nothing beyond dotenv and oclif itself.
 */
export default async function runChecklyCli (): Promise<void> {
  const { loadDotenvFile } = await import('./services/load-dotenv.js')
  await loadDotenvFile()

  // @oclif/core ships CommonJS. Node's import() interop surfaces its
  // getter-based named exports at runtime, but inside the esbuild bundle the
  // dynamic import resolves to a namespace where only `default` (the
  // module.exports object) is statically known, so resolve through it and
  // fall back for unbundled runs.
  const imported = await import('@oclif/core')
  const { execute, settings } = ((imported as unknown as { default?: typeof imported }).default) ?? imported
  settings.enableAutoTranspile = false
  await execute({ dir: import.meta.url })
}
