export interface Country {
  code: string
  name: string
  currency: string
  callingCode: number
  continent: 'AF' | 'AN' | 'AS' | 'EU' | 'NA' | 'OC' | 'SA'
}

// A deliberately chunky data module — the kind of large source file that
// inflates parser AST and source-content memory when it sits in a dependency
// graph that gets bundled.
export const countries: Country[] = [
  { code: 'US', name: 'United States', currency: 'USD', callingCode: 1, continent: 'NA' },
  { code: 'CA', name: 'Canada', currency: 'CAD', callingCode: 1, continent: 'NA' },
  { code: 'MX', name: 'Mexico', currency: 'MXN', callingCode: 52, continent: 'NA' },
  { code: 'BR', name: 'Brazil', currency: 'BRL', callingCode: 55, continent: 'SA' },
  { code: 'AR', name: 'Argentina', currency: 'ARS', callingCode: 54, continent: 'SA' },
  { code: 'CL', name: 'Chile', currency: 'CLP', callingCode: 56, continent: 'SA' },
  { code: 'CO', name: 'Colombia', currency: 'COP', callingCode: 57, continent: 'SA' },
  { code: 'PE', name: 'Peru', currency: 'PEN', callingCode: 51, continent: 'SA' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP', callingCode: 44, continent: 'EU' },
  { code: 'IE', name: 'Ireland', currency: 'EUR', callingCode: 353, continent: 'EU' },
  { code: 'FR', name: 'France', currency: 'EUR', callingCode: 33, continent: 'EU' },
  { code: 'DE', name: 'Germany', currency: 'EUR', callingCode: 49, continent: 'EU' },
  { code: 'ES', name: 'Spain', currency: 'EUR', callingCode: 34, continent: 'EU' },
  { code: 'PT', name: 'Portugal', currency: 'EUR', callingCode: 351, continent: 'EU' },
  { code: 'IT', name: 'Italy', currency: 'EUR', callingCode: 39, continent: 'EU' },
  { code: 'NL', name: 'Netherlands', currency: 'EUR', callingCode: 31, continent: 'EU' },
  { code: 'BE', name: 'Belgium', currency: 'EUR', callingCode: 32, continent: 'EU' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF', callingCode: 41, continent: 'EU' },
  { code: 'AT', name: 'Austria', currency: 'EUR', callingCode: 43, continent: 'EU' },
  { code: 'SE', name: 'Sweden', currency: 'SEK', callingCode: 46, continent: 'EU' },
  { code: 'NO', name: 'Norway', currency: 'NOK', callingCode: 47, continent: 'EU' },
  { code: 'DK', name: 'Denmark', currency: 'DKK', callingCode: 45, continent: 'EU' },
  { code: 'FI', name: 'Finland', currency: 'EUR', callingCode: 358, continent: 'EU' },
  { code: 'PL', name: 'Poland', currency: 'PLN', callingCode: 48, continent: 'EU' },
  { code: 'CZ', name: 'Czechia', currency: 'CZK', callingCode: 420, continent: 'EU' },
  { code: 'GR', name: 'Greece', currency: 'EUR', callingCode: 30, continent: 'EU' },
  { code: 'RO', name: 'Romania', currency: 'RON', callingCode: 40, continent: 'EU' },
  { code: 'RU', name: 'Russia', currency: 'RUB', callingCode: 7, continent: 'EU' },
  { code: 'TR', name: 'Turkey', currency: 'TRY', callingCode: 90, continent: 'AS' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED', callingCode: 971, continent: 'AS' },
  { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', callingCode: 966, continent: 'AS' },
  { code: 'IL', name: 'Israel', currency: 'ILS', callingCode: 972, continent: 'AS' },
  { code: 'IN', name: 'India', currency: 'INR', callingCode: 91, continent: 'AS' },
  { code: 'CN', name: 'China', currency: 'CNY', callingCode: 86, continent: 'AS' },
  { code: 'JP', name: 'Japan', currency: 'JPY', callingCode: 81, continent: 'AS' },
  { code: 'KR', name: 'South Korea', currency: 'KRW', callingCode: 82, continent: 'AS' },
  { code: 'SG', name: 'Singapore', currency: 'SGD', callingCode: 65, continent: 'AS' },
  { code: 'HK', name: 'Hong Kong', currency: 'HKD', callingCode: 852, continent: 'AS' },
  { code: 'TH', name: 'Thailand', currency: 'THB', callingCode: 66, continent: 'AS' },
  { code: 'ID', name: 'Indonesia', currency: 'IDR', callingCode: 62, continent: 'AS' },
  { code: 'MY', name: 'Malaysia', currency: 'MYR', callingCode: 60, continent: 'AS' },
  { code: 'PH', name: 'Philippines', currency: 'PHP', callingCode: 63, continent: 'AS' },
  { code: 'VN', name: 'Vietnam', currency: 'VND', callingCode: 84, continent: 'AS' },
  { code: 'AU', name: 'Australia', currency: 'AUD', callingCode: 61, continent: 'OC' },
  { code: 'NZ', name: 'New Zealand', currency: 'NZD', callingCode: 64, continent: 'OC' },
  { code: 'ZA', name: 'South Africa', currency: 'ZAR', callingCode: 27, continent: 'AF' },
  { code: 'EG', name: 'Egypt', currency: 'EGP', callingCode: 20, continent: 'AF' },
  { code: 'NG', name: 'Nigeria', currency: 'NGN', callingCode: 234, continent: 'AF' },
  { code: 'KE', name: 'Kenya', currency: 'KES', callingCode: 254, continent: 'AF' },
  { code: 'MA', name: 'Morocco', currency: 'MAD', callingCode: 212, continent: 'AF' },
]

const byCode = new Map(countries.map(country => [country.code, country]))

export function findCountry (code: string): Country | undefined {
  return byCode.get(code.toUpperCase())
}

export function countriesByContinent (continent: Country['continent']): Country[] {
  return countries.filter(country => country.continent === continent)
}

export function isSupportedCurrency (currency: string): boolean {
  return countries.some(country => country.currency === currency)
}
