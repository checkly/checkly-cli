import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./e2e/clear-git-env.ts'],
    include: [
      './e2e/__tests__/**/*.spec.ts',
    ],
    exclude: [
      '**/fixtures/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/gen/**',
    ],
  },
})
