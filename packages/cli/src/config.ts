import type { ChecklyConfig } from './services/checkly-config-loader'

/**
 *  Supported regions
 */

declare module './' {
  export interface Region {
    'us-east-1': string
    'us-east-2': string
    'us-west-1': string
    'us-west-2': string
    'ca-central-1': string
    'sa-east-1': string
    'eu-west-1': string
    'eu-central-1': string
    'eu-west-2': string
    'eu-west-3': string
    'eu-north-1': string
    'eu-south-1': string
    'me-south-1': string
    'ap-southeast-1': string
    'ap-northeast-1': string
    'ap-east-1': string
    'ap-southeast-2': string
    'ap-southeast-3': string
    'ap-northeast-2': string
    'ap-northeast-3': string
    'ap-south-1': string
    'af-south-1': string
  }
}

export function defineConfig (config: ChecklyConfig): ChecklyConfig {
  return config
}
