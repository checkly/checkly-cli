import { defineConfig } from '../src/config.js'

// The prune entry union accepts global name patterns, member-scoped
// remove entries and member-scoped keep entries side by side, plus the
// standalone class-keyed form.
export const validEntries = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
  bundle: {
    packages: {
      prune: [
        '@acme/*',
        '!@acme/keep',
        { member: 'my-app', remove: ['left-pad'] },
        { member: ['.', '@acme/**', '!@acme/e2e'], remove: { peerDependencies: true, dependencies: ['ms'] } },
        { member: 'my-app', keep: ['@acme/utils'] },
        { member: 'my-app', keep: { dependencies: ['@acme/utils'], devDependencies: true } },
      ],
    },
  },
})

export const validClasses = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
  bundle: {
    packages: {
      prune: {
        peerDependencies: true,
        devDependencies: ['@acme/*'],
      },
    },
  },
})

// A member-scoped entry carries exactly one of `remove` and `keep`; both
// and neither fail to compile at the entry site.
export const invalidEntries = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
  bundle: {
    packages: {
      prune: [
        // @ts-expect-error an entry cannot carry both remove and keep
        { member: 'my-app', remove: ['left-pad'], keep: ['ms'] },
        // @ts-expect-error an entry must carry remove or keep
        { member: 'my-app' },
      ],
    },
  },
})
