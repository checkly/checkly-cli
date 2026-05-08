import { unknown, Value } from '../sourcegen/index.js'
import { PlaywrightConfig } from './playwright-config.js'

export type PlaywrightConfigResource = PlaywrightConfig

export function valueForPlaywrightConfig (config: PlaywrightConfigResource): Value {
  return unknown(config)
}
