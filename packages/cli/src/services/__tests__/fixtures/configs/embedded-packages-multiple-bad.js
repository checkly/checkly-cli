// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of bundle.packages.embed is what rejects it. Contains
// two invalid specs to verify that both are reported in a single run.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      embed: ['Not A Valid Name', 'left-pad@^1.0.0'],
    },
  },
}

export default config
