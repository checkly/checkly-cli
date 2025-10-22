import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'Workspace Example Project',
  logicalId: '56fbaf4d-fc2c-418c-868a-3f461809ed37',
  checks: {
    checkMatch: '**/__checks__/**/*.check.ts',
    tags: [
      'mac',
    ],
  },
})

export default config
