import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // linked-pkg is created as a symlink to ./packages/tests-pkg at test time;
  // testDir runs *through* the link into a subdirectory of its target.
  testDir: './linked-pkg/src/tests/flows',
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
});
