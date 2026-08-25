import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: {
        peerDependencies: true,
        devDependencies: ['@acme/*'],
      },
    },
  },
})

export default config
