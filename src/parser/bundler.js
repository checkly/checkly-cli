const path = require('path')
const rollup = require('rollup')
const virtual = require('@rollup/plugin-virtual')
const commonjs = require('@rollup/plugin-commonjs')
const typescript = require('@rollup/plugin-typescript')
const modulesAllowlist = require('./modules-allowlist')

const OUTPUT_DIRECTORY = '../../.checkly/output'
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
    return output
  } finally {
    await bundle.close()
  }

  // for (for output)
}

module.exports = bundle
