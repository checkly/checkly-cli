'use strict'

// Required by ./run.cjs only after the Node version preflight has passed.
// Dynamic import keeps this a CommonJS module: require() of @oclif/core
// would throw ERR_REQUIRE_ASYNC_MODULE if its graph ever adopted top-level
// await.
void (async () => {
  const { execute, settings } = await import('@oclif/core')
  settings.enableAutoTranspile = false
  await execute({ dir: __dirname })
})()
