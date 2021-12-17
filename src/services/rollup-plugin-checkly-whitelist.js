const axios = require('axios')
const chalk = require('chalk')

module.exports = function plugin(options = {}) {
  return {
    name: 'checkly-whitelist',
    async generateBundle(bundleOptions, bundle) {
      const { data } = await axios.get('https://api.checklyhq.com/v1/runtimes')

      const runtime = data.find((runtime) => runtime.name === options.runtime)
      if (!runtime) {
        data.find((runtime) => runtime.default)
      }

      const latestRuntimeDeps = Object.keys(runtime.dependencies)

      Object.values(bundle).forEach((script) => {
        script.imports.forEach((i) => {
          if (!latestRuntimeDeps.includes(i)) {
            this.error(
              `Invalid import of ${chalk.blue.bold(i)} package in check script.`
            )
          }
        })
      })
    },
  }
}
