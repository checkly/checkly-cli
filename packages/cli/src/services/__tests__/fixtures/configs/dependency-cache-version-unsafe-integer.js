// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of caching.dependencyCache.version is what rejects it.
// 1e21 is an integer per Number.isInteger but not a safe one, and String(1e21)
// produces exponent notation ('1e+21').
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: {
    dependencyCache: {
      version: 1e21,
    },
  },
}

export default config
