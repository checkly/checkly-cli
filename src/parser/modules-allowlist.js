const axios = require('axios')
const builtinModules = require('builtin-modules')

module.exports = function plugin (options = {}) {
  return {
    name: 'modules-allowlist',
    async generateBundle (bundleOptions, bundle) {
      const { data } = await axios.get('https://api.checklyhq.com/v1/runtimes')

      const runtime = data.find((runtime) => runtime.name === options.runtime)
      if (!runtime) {
        data.find((runtime) => runtime.default)
      }

      const allowedModules = [...builtinModules, ...Object.keys(runtime.dependencies)]

      Object.values(bundle).forEach((script) => {
        script.imports.forEach((i) => {
          if (!allowedModules.includes(i)) {
            this.error(`Invalid import of ${i} package in check script.`)
          }
        })
      })
    }
  }
}
