import type { Ora } from 'ora'
import ora from 'ora'

export function spinner (text: string): Ora {
  return ora({
    text: `${text}`,
    stream: process.stdout,
  }).start()
}
