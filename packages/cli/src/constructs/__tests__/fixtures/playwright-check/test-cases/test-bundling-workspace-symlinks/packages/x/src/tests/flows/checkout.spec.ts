import { test, expect } from '@playwright/test'

import { helper } from '../../helper.js'
import { entry } from '@scope/w'

test('checkout flow', async () => {
  expect(helper()).toBe('ok')
  expect(entry()).toBe('w')
})
