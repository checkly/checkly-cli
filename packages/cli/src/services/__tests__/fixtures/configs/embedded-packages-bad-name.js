// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of bundle.packages.embed is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      embed: ['Not A Valid Name'],
    },
  },
}

export default config
