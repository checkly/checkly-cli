const path = require('path')
const rollup = require('rollup')
const commonjs = require('@rollup/plugin-commonjs')
const typescript = require('@rollup/plugin-typescript')
const modulesAllowlist = require('./modules-allowlist')

const TS = 'ts'

async function bundle (check) {
  const inputOptions = {
    input: check.entry,
    silent: true,
    onwarn: () => {},
    plugins: [
      modulesAllowlist({ runtime: check.runtime || '2022.02' }),
      commonjs({ sourceMap: true }),
    ],
  }

  if (check.lang === TS || (check.entry && path.extname(check.entry) === `.${TS}`)) {
    inputOptions.plugins.unshift(typescript())
  }

  const outputOptions = {
    sourcemap: true,
    exports: 'auto',
    format: 'es',
  }

  const bundle = await rollup.rollup(inputOptions)
  try {
    const { output } = await bundle.generate(outputOptions)
    const bundled = {
      dependencies: [],
    }
    for (const [index, filename] of output[0].map.sources.entries()) {
      if (check.entry.endsWith(filename)) {
        bundled.script = output[0].map.sourcesContent[index]
        bundled.scriptPath = filename
      }
      bundled.dependencies.push(
        {
          path: filename,
          content: output[0].map.sourcesContent[index],
        },
      )
    }
    return bundled
  } finally {
    await bundle.close()
  }
}

module.exports = bundle
