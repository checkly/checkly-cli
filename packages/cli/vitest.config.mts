import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      './src/**/*.spec.ts',
    ],
    exclude: [
      '**/fixtures/**',
      '**/*-fixtures/**',
      '**/node_modules/**',
      '**/dist/**',
    ],
  },
})
