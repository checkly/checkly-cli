import type { Ora } from 'ora'
import ora from 'ora'
// import chalk from 'chalk'

export function spinner (text: string): Ora {
  return ora({
    text: `${text}`,
  }).start()
}
