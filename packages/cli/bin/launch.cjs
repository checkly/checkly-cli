'use strict'

// Required by ./run.cjs only after the Node version preflight has passed.
// The CLI is the esbuild bundle at dist/bundle/cli.js (see scripts/bundle.mjs):
// it includes @oclif/core, all commands and every pure-JS dependency. Loading
// it with dynamic import() keeps this file CommonJS. oclif later dynamic-imports
// the same bundle path to resolve commands, which the Node module cache serves
// from this load, so there is exactly one instance of every module. External
// dependencies resolved at runtime (oxc-parser, typescript-estree) are looked
// up from this package's node_modules exactly as before.
void (async () => {
  const { default: runChecklyCli } = await import('../dist/bundle/cli.js')
  await runChecklyCli()
})()
