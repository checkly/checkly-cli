import { test, expect } from '@playwright/test'

import { entry } from '@fixture-embed/used'

test('uses the workspace member', async () => {
  expect(entry()).toBe('used')
})
