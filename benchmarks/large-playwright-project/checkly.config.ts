import { defineConfig } from 'checkly'

export default defineConfig({
  projectName: 'Large Playwright Project',
  logicalId: 'large-playwright-project',
  checks: {
    // Only the *.check.ts file below defines checks. The Playwright specs in
    // ./tests are discovered through the Playwright config, not as Checkly
    // check files.
    //
    // NB: do NOT set a project-level `playwrightConfigPath` here — it would
    // auto-create an extra implicit PlaywrightCheck on top of the ones the
    // loop generates. Each check sets its own config path instead.
    checkMatch: '**/*.check.ts',
  },
})
