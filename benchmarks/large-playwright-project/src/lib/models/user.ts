import { assertDefined, assertNonEmpty, assertRange } from '../core/assert'
import { map, Result } from '../core/result'
import { findCountry } from '../data/countries'

export interface User {
  id: string
  email: string
  age: number
  countryCode: string
}

export function validateUser (input: Partial<User>): Result<User> {
  const id = assertNonEmpty(input.id ?? '', 'id')
  if (!id.ok) {
    return id
  }
  const email = assertDefined(input.email, 'email')
  if (!email.ok) {
    return email
  }
  const age = assertRange(input.age ?? -1, 0, 150, 'age')
  if (!age.ok) {
    return age
  }
  const country = assertDefined(input.countryCode, 'countryCode')
  if (!country.ok) {
    return country
  }

  return map(age, ageValue => ({
    id: id.value,
    email: email.value,
    age: ageValue,
    countryCode: country.value,
  }))
}

export function userCallingCode (user: User): number | undefined {
  return findCountry(user.countryCode)?.callingCode
}
