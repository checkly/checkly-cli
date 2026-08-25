import { test, expect } from '@playwright/test'

import { entry } from '@fixture-prune/used'

test('uses the workspace member', async () => {
  expect(entry()).toBe('used')
})
