// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime shape validation of the deprecated caching block is what rejects
// it. A null value (e.g. from a conditional expression) must produce a
// diagnostic, not a crash.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: null,
}

export default config
