// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it. The fields are present but not
// strings, which is a different diagnostic than a missing field.
const config = {
  projectName: 42,
  logicalId: false,
}

export default config
