export interface ParsedFields {
  [key: string]: unknown
}

export function parseFields (fields: string[]): ParsedFields {
  const result: ParsedFields = {}

  for (const entry of fields) {
    const jsonIndex = entry.indexOf(':=')
    if (jsonIndex !== -1) {
      const key = entry.slice(0, jsonIndex)
      const raw = entry.slice(jsonIndex + 2)
      try {
        result[key] = JSON.parse(raw)
      } catch {
        throw new Error(`Invalid JSON in field "${key}": ${raw}`)
      }
      continue
    }

    const eqIndex = entry.indexOf('=')
    if (eqIndex === -1) {
      throw new Error(`Invalid field format: "${entry}". Expected key=value or key:=json.`)
    }
    result[entry.slice(0, eqIndex)] = entry.slice(eqIndex + 1)
  }

  return result
}
