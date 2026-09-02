// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it. A misshapen runner.cache.install
// alongside the deprecated caching block must produce diagnostics, not
// crash the declaration-based conflict check.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: {
    dependencyCache: {
      version: 'v1',
    },
  },
  runner: {
    cache: {
      install: 'v2',
    },
  },
}

export default config
