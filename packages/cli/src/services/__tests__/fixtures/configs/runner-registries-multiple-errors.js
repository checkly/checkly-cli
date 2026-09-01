// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it. Contains several independent errors
// inside runner.registries to verify that all of them are reported in a
// single run.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    registries: {
      upstreams: {
        yarnpkg: {
          url: 'https://registry.yarnpkg.com/',
          auth: {},
        },
      },
      packages: [
        { pattern: '**', upstreams: ['yarnpkg', 'red'] },
      ],
    },
  },
}

export default config
