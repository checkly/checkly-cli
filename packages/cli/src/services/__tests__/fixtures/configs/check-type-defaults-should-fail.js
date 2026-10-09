// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig, which
// leaves shouldFail out of the browser and multistep check defaults, so the
// runtime validation is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  checks: {
    shouldFail: true,
    browserChecks: {
      shouldFail: true,
    },
    multiStepChecks: {
      shouldFail: false,
    },
  },
}

export default config
