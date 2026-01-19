// Safe shell characters: %+,-./:=@_ and alphanumeric
const SAFE_SHELL_CHARS = /^[%+,\-./:=@_0-9A-Za-z]+$/

export function shellQuote (arg: string): string {
  if (arg === '') {
    return `''`
  }
  if (SAFE_SHELL_CHARS.test(arg)) {
    return arg
  }
  return `'${arg.replace(/'/g, `'"'"'`)}'`
}

export function shellJoin (args: string[]): string {
  return args.map(shellQuote).join(' ')
}
