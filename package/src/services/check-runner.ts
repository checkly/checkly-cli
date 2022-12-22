import { checks as checksApi } from '../rest/api'
import { SocketClient } from './socket-client'
import * as uuid from 'uuid'
import ListReporter from '../reporters/list'
import PQueue from 'p-queue'
import { EventEmitter, once } from 'node:events'

export async function runChecks (checks: any[], location: string, reporter: ListReporter) {
  const socketClient = await SocketClient.connect()
  // TODO: Remove the queue and run all checks in parallel?
  const queue = new PQueue({ concurrency: 5 })
  for (const check of checks) {
    queue.add(async () => {
      const websocketClientId = uuid.v4()
      // Configure the listener before triggering the check run
      const checkEventEmitter = await configureResultListener(websocketClientId, check, reporter, socketClient)
      try {
        await checksApi.run({
          runLocation: location,
          websocketClientId,
          ...check,
        })
      } catch (err: any) {
        if (err?.response?.status === 402) {
          console.error(`Failed to run a check. ${err.response.data.message}`)
          // TODO: Find a way to abort. The latest version supports this but doesn't work with TS
          return
        }
      }
      await once(checkEventEmitter, 'finished')
    })
  }
  await queue.onIdle()
  await socketClient.end()
  reporter.onEnd()
}

async function configureResultListener (
  websocketClientId: string,
  check: any,
  reporter: ListReporter,
  socketClient: SocketClient,
): Promise<EventEmitter> {
  const baseTopic = `${check.checkType.toLowerCase()}-check-results/${websocketClientId}`
  const runStartTopic = `${baseTopic}/run-start`
  const runEndTopic = `${baseTopic}/run-end`
  const runErrorTopic = `${baseTopic}/error`

  const checkEventEmitter = new EventEmitter()
  await socketClient.subscribe({
    [runStartTopic]: () => {
      reporter.onCheckBegin(check)
    },
    [runEndTopic]: async (message: any) => {
      const { result } = message
      // TODO: Handle check assets (logs, screenshots)
      reporter.onCheckEnd({ logicalId: check.logicalId, ...result })
      await socketClient.unsubscribe([runStartTopic, runEndTopic, runErrorTopic])
      checkEventEmitter.emit('finished')
    },
    [runErrorTopic]: async (message: any) => {
      // TODO: Add proper handling for this case
      console.error('There was an error running a check', message)
      await socketClient.unsubscribe([runStartTopic, runEndTopic, runErrorTopic])
      checkEventEmitter.emit('finished')
    },
  })
  return checkEventEmitter
}
