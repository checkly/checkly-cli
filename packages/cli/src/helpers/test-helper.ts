import { PrivateRunLocation, RunLocation } from '../services/abstract-check-runner'
import { Session } from '../constructs'
import type { Region } from '..'
import { ReporterType } from '../reporters/reporter'
import { isCI } from 'ci-info'

const DEFAULT_REGION = 'eu-central-1'

export async function prepareRunLocation (
  configOptions: { runLocation?: keyof Region, privateRunLocation?: string } = {},
  cliFlags: { runLocation?: keyof Region, privateRunLocation?: string } = {},
  api: any,
  accountId: string,
): Promise<RunLocation> {
  // Command line options take precedence
  if (cliFlags.runLocation) {
    const { data: availableLocations } = await api.locations.getAll()
    if (availableLocations.some((l: { region: string | undefined }) => l.region === cliFlags.runLocation)) {
      return { type: 'PUBLIC', region: cliFlags.runLocation }
    }
    throw new Error(`Unable to run checks on unsupported location "${cliFlags.runLocation}". ` +
      `Supported locations are:\n${availableLocations.map((l: { region: any }) => `${l.region}`).join('\n')}`)
  } else if (cliFlags.privateRunLocation) {
    return preparePrivateRunLocation(cliFlags.privateRunLocation, api, accountId)
  } else if (configOptions.runLocation && configOptions.privateRunLocation) {
    throw new Error('Both runLocation and privateRunLocation fields were set in your Checkly config file.' +
      ` Please only specify one run location. The configured locations were' +
        ' "${configOptions.runLocation}" and "${configOptions.privateRunLocation}"`)
  } else if (configOptions.runLocation) {
    return { type: 'PUBLIC', region: configOptions.runLocation }
  } else if (configOptions.privateRunLocation) {
    return preparePrivateRunLocation(configOptions.privateRunLocation, api, accountId)
  } else {
    return { type: 'PUBLIC', region: DEFAULT_REGION }
  }
}

export async function preparePrivateRunLocation (privateLocationSlugName: string, api: any, accountId: string): Promise<PrivateRunLocation> {
  try {
    const privateLocations = await Session.getPrivateLocations()
    const privateLocation = privateLocations.find(({ slugName }) => slugName === privateLocationSlugName)
    if (privateLocation) {
      return { type: 'PRIVATE', id: privateLocation.id, slugName: privateLocationSlugName }
    }
    const { data: account } = await api.accounts.get(accountId)
    throw new Error(`The specified private location "${privateLocationSlugName}" was not found on account "${account.name}".`)
  } catch (err: any) {
    throw new Error(`Failed to get private locations. ${err.message}.`)
  }
}

export function prepareReportersTypes (reporterFlag: ReporterType, cliReporters: ReporterType[] = []): ReporterType[] {
  if (!reporterFlag && !cliReporters.length) {
    return [isCI ? 'ci' : 'list']
  }
  return reporterFlag ? [reporterFlag] : cliReporters
}
