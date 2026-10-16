import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./src/testing/global-setup.ts'],
    setupFiles: ['./src/testing/clear-git-env.ts'],
    environment: 'node',
    include: [
      './src/**/*.spec.ts',
    ],
    exclude: [
      '**/fixtures/**',
      '**/*-fixtures/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/onboarding-boilerplate/**',
    ],
  },
})
