import { unknown, Value } from '../sourcegen'
import { PlaywrightConfig } from './playwright-config'

export type PlaywrightConfigResource = PlaywrightConfig

export function valueForPlaywrightConfig (config: PlaywrightConfigResource): Value {
  return unknown(config)
}
