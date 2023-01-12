import { Hook } from '@oclif/core'
import { api } from '../rest/api'

// eslint-disable-next-line require-await
const hook: Hook.Prerun = async function ({ config: oclifConfig }) {
  api.defaults.headers['x-checkly-cli-version'] = oclifConfig.version
}

export default hook
