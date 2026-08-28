import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Playwright Check Fixture',
  logicalId: 'playwright-check-fixture',
  checks: {
    checkMatch: '**/*.check.ts',
  },
  runner: {
    registries: {
      upstreams: {
        npmjs: { url: 'https://registry.npmjs.org/' },
        internal: {
          url: 'https://npm.example.com/npm-group',
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
