// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of caching.dependencyCache.version is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: {
    dependencyCache: {
      version: 1.5,
    },
  },
}

export default config
