// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of the bundle section is what rejects it.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: ['@acme/private-utils'],
}

export default config
