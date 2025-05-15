export interface WrapOptions {
  length?: number
  prefix?: string
  trimPrefix?: boolean
}

export function wrap (
  content: string,
  { length = 80, prefix = '', trimPrefix = true }: WrapOptions = {},
): string {
  const tokens = content.split(/([ \t\r\n])/)
  const lines = []
  let line = ''
  let trim = 0

  const prefixTrim = trimPrefix
    ? (prefix.match(/[ \t]$/) ?? [''])[0].length
    : 0

  for (const token of tokens) {
    if (token === '') {
      // Between tokens, not useful, skip.
      continue
    }

    if (token === '\r') {
      // Remove entirely.
      continue
    }

    if (token === ' ' || token === '\t') {
      // Add indiscriminately. These will get trimmed if needed.
      line += token
      trim += 1
      continue
    }

    if (token === '\n') {
      // Respect line endings.
      lines.push(line.slice(0, line.length - trim))
      line = prefix
      trim = prefixTrim
      continue
    }

    if (line.length === 0) {
      // We can assume that the first token of a line will always fit. Even
      // if it does not, it would not fit on any other line either.
      line += prefix
      line += token
      continue
    }

    if (line.length + token.length > length) {
      // Line would get too long, start a new line.
      lines.push(line.slice(0, line.length - trim))
      line = prefix
    }

    trim = 0
    line += token
  }

  lines.push(line.slice(0, line.length - trim))

  return lines.join('\n')
}
