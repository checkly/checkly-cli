import { PrivateRunLocation, RunLocation } from '../services/abstract-check-runner.js'
import { Session } from '../constructs/index.js'
import type { Region } from '../index.js'
import { ReporterType } from '../reporters/reporter.js'
import { isCI } from 'ci-info'
import { DEFAULT_REGION } from './constants.js'

const unsupportedDetachedReporterTypes: ReporterType[] = ['json', 'github']

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
    throw new Error(`Unable to run checks on unsupported location "${cliFlags.runLocation}". `
      + `Supported locations are:\n${availableLocations.map((l: { region: any }) => `${l.region}`).join('\n')}`)
  } else if (cliFlags.privateRunLocation) {
    return preparePrivateRunLocation(cliFlags.privateRunLocation, api, accountId)
  } else if (configOptions.runLocation && configOptions.privateRunLocation) {
    throw new Error('Both runLocation and privateRunLocation fields were set in your Checkly config file.'
      + ` Please only specify one run location. The configured locations were' +
        ' "${configOptions.runLocation}" and "${configOptions.privateRunLocation}"`)
  } else if (configOptions.runLocation) {
    return { type: 'PUBLIC', region: configOptions.runLocation }
  } else if (configOptions.privateRunLocation) {
    return preparePrivateRunLocation(configOptions.privateRunLocation, api, accountId)
  } else {
    return { type: 'PUBLIC', region: DEFAULT_REGION }
  }
}

export async function preparePrivateRunLocation (
  privateLocationSlugName: string,
  api: any,
  accountId: string,
): Promise<PrivateRunLocation> {
  try {
    const privateLocations = await Session.getPrivateLocations()
    const privateLocation = privateLocations.find(({ slugName }) => slugName === privateLocationSlugName)
    if (privateLocation) {
      return { type: 'PRIVATE', id: privateLocation.id, slugName: privateLocationSlugName }
    }
    const { data: account } = await api.accounts.get(accountId)
    throw new Error(`The specified private location "${privateLocationSlugName}" was not found on account "${account.name}".`)
  } catch (err: any) {
    throw new Error(`Failed to get private locations. ${err.message}.`, { cause: err })
  }
}

export function prepareReportersTypes (
  reporterFlag: ReporterType[] | undefined,
  cliReporters: ReporterType[] = [],
): ReporterType[] {
  if (!reporterFlag?.length && !cliReporters.length) {
    return [isCI ? 'ci' : 'list']
  }
  return reporterFlag?.length ? reporterFlag : cliReporters
}

export function validateDetachReporterTypes (reporterTypes: ReporterType[]): void {
  const unsupported = [...new Set(reporterTypes.filter(type => unsupportedDetachedReporterTypes.includes(type)))]

  if (unsupported.length) {
    throw new Error(
      `--detach does not support ${unsupported.map(type => `--reporter ${type}`).join(', ')}. `
      + 'Detached runs exit after scheduling, before result reports can be written. '
      + 'Omit --detach to write a report, or use `checkly test-sessions get <test-session-id> --output json` after scheduling.',
    )
  }
}

export function splitChecklyAndPlaywrightFlags (args: string[]) {
  const separatorIndex = args.indexOf('--')
  let checklyFlags: string[]
  let playwrightFlags: string[]

  if (separatorIndex !== -1) {
    checklyFlags = args.slice(0, separatorIndex)
    playwrightFlags = args.slice(separatorIndex + 1)
  } else {
    checklyFlags = args
    playwrightFlags = []
  }
  return { checklyFlags, playwrightFlags }
}
