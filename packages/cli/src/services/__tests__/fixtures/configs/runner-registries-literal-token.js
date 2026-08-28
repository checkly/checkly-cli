// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of runner.registries is what rejects the literal token.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: {
    registries: {
      upstreams: {
        internal: {
          url: 'https://npm.example.com/',
          auth: { type: 'bearer', token: 'npm_baked-in-secret' },
        },
      },
      packages: [
        { pattern: '**', upstreams: ['internal'] },
      ],
    },
  },
}

export default config
