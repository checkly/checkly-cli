import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    registries: {
      upstreams: {
        npmjs: { url: 'https://registry.npmjs.org/' },
        internal: {
          url: 'https://npm.example.com/',
          auth: { type: 'bearer', token: '${INTERNAL_NPM_TOKEN}' },
        },
      },
      packages: [
        { pattern: '@acme/**', upstreams: ['internal'] },
        { pattern: '**', upstreams: ['npmjs', 'internal'] },
      ],
    },
  },
})

export default config
