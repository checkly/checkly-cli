// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of bundle.packages.prune is what rejects it. The
// name@version pin syntax belongs to bundle.packages.embed and must fail
// loudly here.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: ['legacy-private-pkg@2.1.0'],
    },
  },
}

export default config
