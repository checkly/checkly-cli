const path = require('path')
const rollup = require('rollup')
const virtual = require('@rollup/plugin-virtual')
const commonjs = require('@rollup/plugin-commonjs')
const typescript = require('@rollup/plugin-typescript')
const modulesAllowlist = require('./modules-allowlist')

const OUTPUT_DIRECTORY = '../../.checkly/output'
const TS = 'ts'

async function bundle (check, writeBundle = false) {
  const inputOptions = {
    silent: true,
    onwarn: () => {},
    plugins: [
      modulesAllowlist({ runtime: check.runtime || '2021.10' }),
      commonjs({ sourceMap: true })
    ]
  }

  if (check.lang === TS || (check.path && path.extname(check.path) === `.${TS}`)) {
    inputOptions.plugins.unshift(typescript())
  }

  if (check.script) {
    inputOptions.input = 'main'
    inputOptions.plugins.push(virtual({ main: check.script }))
  } else if (check.path) {
    inputOptions.input = path.join(process.cwd(), check.path)
  } else {
    throw new Error('Missing script or path properties in check.')
  }

  const outputOptions = {
    sourcemap: true,
    exports: 'auto',
    dir: path.join(__dirname, OUTPUT_DIRECTORY),
    format: 'es'
  }

  const bundle = await rollup.rollup(inputOptions)
  const { output } = await bundle.generate(outputOptions)

  writeBundle && (await bundle.write(outputOptions))

  await bundle.close()

  return output
}

module.exports = bundle
