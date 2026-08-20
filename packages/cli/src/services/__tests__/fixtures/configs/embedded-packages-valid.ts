import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      embed: ['@acme/private-utils', 'legacy-private-pkg@2.1.0', '@acme/*', 'acme-*'],
    },
  },
})

export default config
