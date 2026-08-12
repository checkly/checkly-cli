// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of checks.embeddedPackages is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  checks: {
    embeddedPackages: ['Not A Valid Name'],
  },
}

export default config
