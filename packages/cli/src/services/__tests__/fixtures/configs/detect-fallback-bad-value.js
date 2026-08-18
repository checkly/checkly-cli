// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of checks.detectEmbeddedPackagesFallback rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  checks: {
    detectEmbeddedPackagesFallback: 'ask-nicely',
  },
}

export default config
