const path = require('path')
const rollup = require('rollup')
const commonjs = require('@rollup/plugin-commonjs')
const sourcemaps = require('rollup-plugin-sourcemaps')

const OUTPUT_DIRECTORY = '../../.checkly/output'

async function bundle(entryFile, writeBundle = false) {
  const inputOptions = {
    input: path.join(process.cwd(), entryFile),
    plugins: [commonjs(), sourcemaps()],
  }

  const outputOptions = {
    sourcemap: true,
    exports: 'auto',
    dir: path.join(__dirname, OUTPUT_DIRECTORY),
    format: 'cjs',
  }

  const bundle = await rollup.rollup(inputOptions)
  const { output } = await bundle.generate(outputOptions)

  writeBundle && (await bundle.write(outputOptions))

  await bundle.close()

  return output
}

module.exports = bundle
