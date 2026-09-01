// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of runner.cache.install.version is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    cache: {
      install: {
        version: true,
      },
    },
  },
}

export default config
