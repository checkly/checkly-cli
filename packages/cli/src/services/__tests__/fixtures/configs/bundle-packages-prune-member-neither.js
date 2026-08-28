// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of bundle.packages.prune is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: [{ member: 'my-app' }],
    },
  },
}

export default config
