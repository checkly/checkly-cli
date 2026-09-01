// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it. Contains several independent errors
// inside bundle.packages.prune to verify that all of them are reported in a
// single run.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: {
        peerDependences: true,
        devDependencies: ['ok-name', 'bad@1.0.0'],
        dependencies: 5,
      },
    },
  },
}

export default config
