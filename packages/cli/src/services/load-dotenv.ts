import { readFile } from 'node:fs/promises'
import * as path from 'node:path'
import Debug from 'debug'
import { parse } from 'dotenv'

const debug = Debug('checkly:cli:dotenv')

export async function loadDotenvFile (): Promise<void> {
  if (process.env.CHECKLY_NO_DOTENV === '1') {
    debug('dotenv loading disabled via CHECKLY_NO_DOTENV=1')
    return
  }

  const dotenvPath = path.resolve(process.cwd(), '.env')

  let content: string
  try {
    content = await readFile(dotenvPath, { encoding: 'utf8' })
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      debug('no .env file found at %s', dotenvPath)
      return
    }
    process.stderr.write(`Warning: failed to read .env file at ${dotenvPath}: ${err.message}\n`)
    return
  }

  let parsed: ReturnType<typeof parse>
  try {
    parsed = parse(content)
  } catch (err: any) {
    process.stderr.write(`Warning: failed to parse .env file at ${dotenvPath}: ${err.message}\n`)
    return
  }

  let injectedCount = 0

  for (const [key, value] of Object.entries(parsed)) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      debug('skipping %s (already set in environment)', key)
    } else {
      process.env[key] = value
      injectedCount++
    }
  }

  debug('loaded %d variable(s) from %s', injectedCount, dotenvPath)
}
