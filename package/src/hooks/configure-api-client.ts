import { Hook } from '@oclif/core'
import { api } from '../rest/api'

// eslint-disable-next-line require-await
const hook: Hook.Prerun = async function ({ config: oclifConfig }) {
  api.interceptors.request.use((config) => {
    if (config.headers) {
      config.headers['x-checkly-cli-version'] = oclifConfig.version
    }
    return config
  })
}

export default hook
