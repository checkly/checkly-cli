// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of the runner block is what rejects the misspelled key.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    registires: {
      upstreams: {
        npmjs: { url: 'https://registry.npmjs.org/' },
      },
      packages: [
        { pattern: '**', upstreams: ['npmjs'] },
      ],
    },
  },
}

export default config
