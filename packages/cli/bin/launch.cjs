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

  const { Config, execute, settings } = await import('@oclif/core')
  settings.enableAutoTranspile = false

  let loadOptions = __dirname
  try {
    const config = await Config.load(__dirname)
    // Commands that import the project's files must run with the project's
    // own checkly install, and before any of those files is imported.
    const { runWithProjectCli } = await import('../dist/services/project-cli.js')
    if (await runWithProjectCli(config, process.argv.slice(2))) {
      return
    }
    loadOptions = config
  } catch {
    // execute() loads the config again and reports any error the usual way.
  }

  await execute({ loadOptions })
})()
