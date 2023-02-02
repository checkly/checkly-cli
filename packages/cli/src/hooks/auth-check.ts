import { Hook } from '@oclif/core'
import config from '../services/config'

const hook: Hook.Prerun = async function ({ Command, argv }) {
  // @ts-ignore
  // Command doesn't have an auth field so we need the ts-ignore
  await config.validateAuth(Command.auth)
}

export default hook
