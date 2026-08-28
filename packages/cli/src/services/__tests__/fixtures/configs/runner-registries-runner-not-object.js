// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of the runner block is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  runner: 'registries',
}

export default config
