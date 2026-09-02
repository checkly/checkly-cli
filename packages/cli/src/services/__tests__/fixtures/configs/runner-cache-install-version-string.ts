import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    cache: {
      install: {
        version: 'v2',
      },
    },
  },
})

export default config
