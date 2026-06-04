import { err, ok, Result } from '../core/result'
import { findCountry } from '../data/countries'
import { User } from './user'

export interface LineItem {
  sku: string
  quantity: number
  unitPriceCents: number
}

export interface Order {
  id: string
  user: User
  items: LineItem[]
  currency: string
}

export function orderTotalCents (order: Order): number {
  return order.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0)
}

export function validateOrder (order: Order): Result<Order> {
  const country = findCountry(order.user.countryCode)
  if (!country) {
    return err(new Error(`Unknown country ${order.user.countryCode}`))
  }
  if (order.items.length === 0) {
    return err(new Error('Order must have at least one item'))
  }
  if (country.currency !== order.currency) {
    return err(new Error(`Currency ${order.currency} does not match country ${country.code}`))
  }
  return ok(order)
}
