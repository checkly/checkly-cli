import { defineConfig } from 'checkly'

// Sets the dependency cache version at both the current and the deprecated
// location, which must fail loading with a conflict error. The type permits
// this — only runtime validation rejects it.
const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: {
    dependencyCache: {
      version: 'v1',
    },
  },
  runner: {
    cache: {
      install: {
        version: 'v2',
      },
    },
  },
})

export default config
