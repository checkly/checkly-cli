import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
  },
})
