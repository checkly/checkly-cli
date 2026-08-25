import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: ['@acme/*', '!@acme/keep', 'left-pad'],
    },
  },
})

export default config
