import type { Ora } from 'ora'
import * as ora from 'ora'

export function spinner (text: string): Ora {
  return ora({
    text: `${text}`,
  }).start()
}
