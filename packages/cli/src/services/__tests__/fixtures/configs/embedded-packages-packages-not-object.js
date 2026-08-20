// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of the bundle section is what rejects it. Putting the
// embed list directly under `packages` is a plausible mistake that would
// otherwise silently disable embedding.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: ['@acme/private-utils'],
  },
}

export default config
