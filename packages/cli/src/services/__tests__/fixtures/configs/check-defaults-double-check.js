// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig, which
// leaves doubleCheck out of the check defaults, so the runtime validation is
// what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  checks: {
    doubleCheck: true,
    browserChecks: {
      doubleCheck: false,
    },
    multiStepChecks: {
      doubleCheck: true,
    },
  },
}

export default config
