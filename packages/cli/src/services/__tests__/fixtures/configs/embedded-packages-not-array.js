// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of bundle.packages.embed is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      embed: '@acme/private-utils',
    },
  },
}

export default config
