export type CaseFormat =
  'identity'
  | 'camelCase'
  | 'PascalCase'
  | 'Train-Case'
  | 'snake_case'
  | 'SCREAMING_SNAKE_CASE'
  | 'kebab-case'
  | 'SCREAMING-KEBAB-CASE'

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

export function trainCase (value: string): string {
  return wordify(value).map(word => {
    const initial = word.slice(0, 1).toUpperCase()
    const rest = word.slice(1).toLowerCase()
    return initial + rest
  }).join('-')
}

export function snakeCase (value: string): string {
  return wordify(value).map(word => word.toLowerCase()).join('_')
}

export function screamingSnakeCase (value: string): string {
  return wordify(value).map(word => word.toUpperCase()).join('_')
}

export function kebabCase (value: string): string {
  return wordify(value).map(word => word.toLowerCase()).join('-')
}

export function screamingKebabCase (value: string): string {
  return wordify(value).map(word => word.toUpperCase()).join('-')
}

export function cased (value: string, format: CaseFormat): string {
  switch (format) {
    case 'identity':
      return value
    case 'camelCase':
      return camelCase(value)
    case 'PascalCase':
      return pascalCase(value)
    case 'Train-Case':
      return trainCase(value)
    case 'snake_case':
      return snakeCase(value)
    case 'SCREAMING_SNAKE_CASE':
      return screamingSnakeCase(value)
    case 'kebab-case':
      return kebabCase(value)
    case 'SCREAMING-KEBAB-CASE':
      return screamingKebabCase(value)
    default:
      return value
  }
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

    if (char >= '0' && char <= '9') {
      word += char
      small = true
      continue
    }

    if (char >= 'A' && char <= 'Z') {
      if (small) {
        words.push(word)
        word = char
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
