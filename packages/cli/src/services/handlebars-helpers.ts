// Handlebars do not handle properly nested objects/arrays
export function parse (input: any): any {
  if (typeof input === 'string') {
    return `'${input}'`
  }
  if (typeof input === 'number' || typeof input === 'boolean') {
    return input
  }
  if (Array.isArray(input)) {
    let arr
    for (const o of input) {
      if (!arr) {
        arr = parse(o)
        continue
      }
      arr = `${arr}, ${parse(o)}`
    }
    return `[${arr}]`
  }
  if (typeof input === 'object') {
    const keys = Object.keys(input)
    let returnObj = ''
    for (const key of keys) {
      const curr = `${key}: ${parse(input[key])}`
      returnObj = `${returnObj} ${curr},`
    }
    return `{${returnObj}}`
  }
  return input
}
