import { Output } from './output'
import { Value } from './value'

export class IdentifierValue extends Value {
  value: string

  constructor (value: string) {
    super()
    this.value = value
  }

  render (output: Output): void {
    output.append(this.value)
  }
}

export interface IdentOptions {
  format?: 'camelCase' | 'PascalCase' | 'SCREAMING_SNAKE_CASE'
}

export function ident (value: string, options?: IdentOptions): IdentifierValue {
  const format = options?.format
  if (format === 'camelCase') {
    value = camelCase(value)
  } else if (format === 'SCREAMING_SNAKE_CASE') {
    value = screamingSnakeCase(value)
  }

  return new IdentifierValue(value)
}

function wordify (value: string): string[] {
  const words = []

  let word = ''
  let small = false

  for (const char of value.split('')) {
    if (char >= 'a' && char <= 'z') {
      word += char
      small = true
      continue
    }

    if (word.length !== 0 && char >= '0' && char <= '9') {
      word += char
      small = true
      continue
    }

    if (char >= 'A' && char <= 'Z') {
      if (small) {
        words.push(word)
        word = ''
        small = false
        continue
      }

      word += char
      continue
    }

    if (word.length !== 0) {
      words.push(word)
      word = ''
      small = false
      continue
    }
  }

  if (word.length !== 0) {
    words.push(word)
  }

  return words
}

export function camelCase (value: string): string {
  return wordify(value).map((word, index) => {
    if (index === 0) {
      return word.toLowerCase()
    }
    const initial = word.slice(0, 1).toUpperCase()
    const rest = word.slice(1).toLowerCase()
    return initial + rest
  }).join('')
}

export function pascalCase (value: string): string {
  return wordify(value).map(word => {
    const initial = word.slice(0, 1).toUpperCase()
    const rest = word.slice(1).toLowerCase()
    return initial + rest
  }).join('')
}

export function screamingSnakeCase (value: string): string {
  return wordify(value).map(word => {
    return word.toUpperCase()
  }).join('_')
}
