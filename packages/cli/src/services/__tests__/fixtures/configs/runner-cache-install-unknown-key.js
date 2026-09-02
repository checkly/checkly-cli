// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it. A misspelled key would otherwise
// silently leave the cache version unset.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    cache: {
      install: {
        verison: 'v2',
      },
    },
  },
}

export default config
