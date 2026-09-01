import { defineConfig } from 'checkly'

// The conflict is declaration-based: even though the empty string means
// "unset" as a value (e.g. an unset environment variable), declaring the
// option at both locations must fail deterministically — a value-based rule
// would make the same config load in one environment and fail in another.
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
        version: '',
      },
    },
  },
})

export default config
