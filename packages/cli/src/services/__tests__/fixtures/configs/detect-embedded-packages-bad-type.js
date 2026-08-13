// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of checks.detectEmbeddedPackages is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  checks: {
    detectEmbeddedPackages: 'yes',
  },
}

export default config
