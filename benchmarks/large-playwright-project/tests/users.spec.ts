import { test, expect } from '@playwright/test'

import { userCallingCode, validateUser } from '../src/lib'

test('validates a user and resolves its calling code', async () => {
  const result = validateUser({ id: 'u1', email: 'a@b.com', age: 30, countryCode: 'us' })
  expect(result.ok).toBe(true)
  if (result.ok) {
    expect(userCallingCode(result.value)).toBe(1)
  }
})
