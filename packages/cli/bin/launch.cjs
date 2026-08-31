'use strict'

// Required by ./run.cjs only after the Node version preflight has passed.
// Everything is loaded with dynamic import() so this stays a CommonJS module:
// require() of the ESM dist or @oclif/core would throw
// ERR_REQUIRE_ASYNC_MODULE if any module in the graph ever adopted top-level
// await. Loading dotenv before @oclif/core also means .env values are visible
// to env vars read at import time (e.g. DEBUG, FORCE_COLOR).
void (async () => {
  const { loadDotenvFile } = await import('../dist/services/load-dotenv.js')
  await loadDotenvFile()

  const { execute, settings } = await import('@oclif/core')
  settings.enableAutoTranspile = false
  await execute({ dir: __dirname })
})()
