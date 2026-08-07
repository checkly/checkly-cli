import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Created as a symlink to ./real/tests at test time; fixtures cannot carry
  // symlinks portably (Windows checkouts need special git configuration).
  testDir: './linked-tests',
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
