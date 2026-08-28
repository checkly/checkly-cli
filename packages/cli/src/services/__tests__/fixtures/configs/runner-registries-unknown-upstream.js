// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig (and
// with it the defineConfig upstream-name type check) so the runtime
// validation of runner.registries is what rejects the unknown name.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    registries: {
      upstreams: {
        npmjs: { url: 'https://registry.npmjs.org/' },
      },
      packages: [
        { pattern: '**', upstreams: ['npmjs', 'mirror'] },
      ],
    },
  },
}

export default config
