// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of bundle.packages.prune is what rejects it. The `!`
// exclusion syntax belongs to bundle.packages.embed and must fail loudly here.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: ['!@acme/legacy'],
    },
  },
}

export default config
