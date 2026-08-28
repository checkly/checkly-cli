import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: [
        '@acme/*',
        { member: 'my-app', remove: { peerDependencies: true } },
        { member: ['.', '@acme/**'], keep: { dependencies: ['@acme/utils'], devDependencies: true } },
      ],
    },
  },
})

export default config
