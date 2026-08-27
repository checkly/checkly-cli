import { defineConfig } from '../src/config.js'

// The upstream names inferred from `runner.registries.upstreams` constrain
// the names usable in the routing rules, so a typo in a rule fails to
// compile at the rule site.
export const validConfig = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
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

export const unknownUpstreamName = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
  runner: {
    registries: {
      upstreams: {
        npmjs: { url: 'https://registry.npmjs.org/' },
      },
      packages: [
        // @ts-expect-error 'mirror' is not a key of `upstreams`
        { pattern: '**', upstreams: ['npmjs', 'mirror'] },
      ],
    },
  },
})

// A config without the runner section still infers and compiles as before.
export const noRunnerSection = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
})
