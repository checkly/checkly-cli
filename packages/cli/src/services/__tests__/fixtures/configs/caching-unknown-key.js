// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it. A misspelled key would otherwise
// silently leave the cache version unset.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: {
    dependecyCache: {
      version: 'v3',
    },
  },
}

export default config
