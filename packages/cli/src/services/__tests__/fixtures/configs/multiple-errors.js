// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation is what rejects it. Contains several independent errors
// to verify that all of them are reported in a single run.
const config = {
  projectName: 'multiple-errors',
  // logicalId is missing
  bundle: 5,
  runner: {
    registires: {},
  },
}

export default config
