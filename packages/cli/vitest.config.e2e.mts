import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['./src/testing/global-setup.ts'],
    environment: 'node',
    include: [
      './e2e/__tests__/**/*.spec.ts',
    ],
    exclude: [
      '**/fixtures/**',
      '**/node_modules/**',
      '**/dist/**',
    ],
    testTimeout: 15000,
  },
})
