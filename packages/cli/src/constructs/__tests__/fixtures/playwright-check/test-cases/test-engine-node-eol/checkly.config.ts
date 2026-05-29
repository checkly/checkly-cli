import { defineConfig } from 'checkly'
export default defineConfig({
  projectName: 'Engine Test',
  logicalId: 'engine-test',
  checks: { checkMatch: '**/*.check.ts' },
})
