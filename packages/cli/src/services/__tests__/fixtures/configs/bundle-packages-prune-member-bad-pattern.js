// Plain JS on purpose: bypasses the TypeScript type of ChecklyConfig so the
// runtime validation of bundle.packages.prune is what rejects it. A member
// is addressed by manifest name (or '.'), not by directory path.
const config = {
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  bundle: {
    packages: {
      prune: [{ member: './packages/app', remove: ['left-pad'] }],
    },
  },
}

export default config
