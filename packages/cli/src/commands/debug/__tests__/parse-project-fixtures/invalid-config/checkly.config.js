// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it.
const config = {
  projectName: 'invalid-config',
  // logicalId is missing
  bundle: 5,
}

export default config
