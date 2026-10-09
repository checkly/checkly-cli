// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig, which
// no longer declares a caching block, so the runtime check is what rejects
// it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: {
    dependencyCache: {
      version: 'v2',
    },
  },
}

export default config
