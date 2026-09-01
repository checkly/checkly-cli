// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime shape validation of runner.cache is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    cache: 'v2',
  },
}

export default config
