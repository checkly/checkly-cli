import { PlaywrightCheck } from 'checkly/constructs'

new PlaywrightCheck('check-for-project-a-tests-2', {
  name: 'Check',
  playwrightConfigPath: './projects/a/playwright.config.ts',
  pwProjects: ['tests-2'],
})

new PlaywrightCheck('check-for-project-a-tests-3', {
  name: 'Check',
  playwrightConfigPath: './projects/a/playwright.config.ts',
  pwProjects: ['tests-3'],
})

// new PlaywrightCheck('check-for-project-b', {
//   name: 'Check',
//   playwrightConfigPath: './projects/b/playwright.config.ts',
// })
