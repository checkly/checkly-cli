import { test, expect } from '@playwright/test'

import { findCountry, orderTotalCents, validateOrder } from '../src/lib'

test('computes order totals and validates against country currency', async () => {
  expect(findCountry('US')?.currency).toBe('USD')

  const order = {
    id: 'o1',
    user: { id: 'u1', email: 'a@b.com', age: 30, countryCode: 'US' },
    items: [
      { sku: 'widget', quantity: 2, unitPriceCents: 500 },
      { sku: 'gadget', quantity: 1, unitPriceCents: 1500 },
    ],
    currency: 'USD',
  }

  expect(orderTotalCents(order)).toBe(2500)
  expect(validateOrder(order).ok).toBe(true)
})
