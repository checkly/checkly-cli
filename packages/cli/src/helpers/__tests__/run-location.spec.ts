import os from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  locations: { getAll: vi.fn() },
  accounts: { get: vi.fn() },
}))

/**
 * `trigger` calls the API client module directly; the `test` and `pw-test`
 * helper gets the same object as its `api` argument.
 */
vi.mock('../../rest/api', async importOriginal => ({
  ...await importOriginal<typeof import('../../rest/api.js')>(),
  locations: api.locations,
  accounts: api.accounts,
}))

/**
 * Without the guard a retired `--location` gets this far in `trigger`; stub
 * the run so a regression fails the test instead of reaching the network.
 */
vi.mock('../../services/trigger-runner', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    default: class extends EventEmitter {
      run () {
        return Promise.resolve()
      }
    },
  }
})

vi.mock('../../services/test-session-cancel', () => ({
  registerTestSessionCancelHandler: vi.fn(),
  cancelTestSessionBestEffort: vi.fn(),
}))

vi.mock('../../reporters/reporter', () => ({
  createReporters: vi.fn().mockReturnValue([]),
}))

vi.mock('../../services/checkly-config-loader', async importOriginal => ({
  ...await importOriginal<typeof import('../../services/checkly-config-loader.js')>(),
  loadChecklyConfig: vi.fn(),
}))

import PwTestCommand from '../../commands/pw-test.js'
import Trigger from '../../commands/trigger.js'
import { createCommandContext } from '../../commands/__tests__/helpers/command-context.js'
import { Session } from '../../constructs/index.js'
import type { Region } from '../../index.js'
import type { RunLocation } from '../../services/abstract-check-runner.js'
import { ConfigNotFoundError, loadChecklyConfig } from '../../services/checkly-config-loader.js'
import { DEFAULT_REGION } from '../constants.js'
import { exitCodeFor, InvalidInputError } from '../invalid-input-error.js'
import { prepareRunLocation } from '../test-helper.js'

const MESSAGE = 'Location "me-south-1" (Bahrain) is retired and can no longer run checks. Choose another location.'

/**
 * `me-south-1` is no longer a key of `Region`. The commands cast the raw
 * `--location` string the same way, and a JavaScript config passes it as is.
 */
const typed = (location: string) => location as keyof Region
const RETIRED = typed('me-south-1')
const VALID = typed('eu-central-1')

type RunLocationOptions = { runLocation?: keyof Region, privateRunLocation?: string }
type Prepare = (configOptions: RunLocationOptions, cliFlags: RunLocationOptions) => Promise<RunLocation>

const implementations: [string, Prepare][] = [
  ['helpers/test-helper.ts (test, pw-test)', (configOptions, cliFlags) => {
    return prepareRunLocation(configOptions, cliFlags, api, 'acc-1')
  }],
  ['commands/trigger.ts', (configOptions, cliFlags) => {
    const ctx = createCommandContext({ command: Trigger, members: { account: { id: 'acc-1', name: 'Acme' } } })
    return Trigger.prototype.prepareRunLocation.call(ctx, configOptions, cliFlags)
  }],
]

async function rejection (promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (err) {
    return err
  }
  throw new Error('Expected the promise to reject')
}

function expectNoLocationLookup () {
  expect(api.locations.getAll).not.toHaveBeenCalled()
  expect(api.accounts.get).not.toHaveBeenCalled()
  expect(Session.getPrivateLocations).not.toHaveBeenCalled()
}

beforeEach(() => {
  vi.clearAllMocks()
  /** The API may still list a retired location, so the CLI has to stop it itself. */
  api.locations.getAll.mockResolvedValue({ data: [{ region: 'eu-central-1' }, { region: 'me-south-1' }] })
  api.accounts.get.mockResolvedValue({ data: { name: 'Acme' } })
  vi.spyOn(Session, 'getPrivateLocations').mockResolvedValue([
    { id: 'pl-1', slugName: 'office' },
  ])
})

describe.each(implementations)('prepareRunLocation in %s', (_name, prepare) => {
  it('rejects a retired --location before any API call, as invalid input', async () => {
    const err = await rejection(prepare({}, { runLocation: RETIRED }))

    expect(err).toBeInstanceOf(InvalidInputError)
    expect(err).toHaveProperty('message', MESSAGE)
    expect(exitCodeFor(err)).toBe(2)
    expectNoLocationLookup()
  })

  it('rejects a retired cli.runLocation before any API call, as invalid configuration', async () => {
    const err = await rejection(prepare({ runLocation: RETIRED }, {}))

    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(InvalidInputError)
    expect(err).toHaveProperty('message', MESSAGE)
    expect(exitCodeFor(err)).toBe(1)
    expectNoLocationLookup()
  })

  it('resolves a valid --location through the API, as before', async () => {
    await expect(prepare({}, { runLocation: VALID })).resolves.toEqual({ type: 'PUBLIC', region: 'eu-central-1' })
    expect(api.locations.getAll).toHaveBeenCalledTimes(1)
  })

  it('still rejects an unknown --location after asking the API', async () => {
    await expect(prepare({}, { runLocation: typed('xx-nowhere-1') }))
      .rejects.toThrow('Unable to run checks on unsupported location "xx-nowhere-1".')
    expect(api.locations.getAll).toHaveBeenCalledTimes(1)
  })

  it('lets a valid --location win over a retired cli.runLocation', async () => {
    await expect(prepare({ runLocation: RETIRED }, { runLocation: VALID }))
      .resolves.toEqual({ type: 'PUBLIC', region: 'eu-central-1' })
  })

  it('returns a valid cli.runLocation without an API call, as before', async () => {
    await expect(prepare({ runLocation: typed('us-east-1') }, {}))
      .resolves.toEqual({ type: 'PUBLIC', region: 'us-east-1' })
    expectNoLocationLookup()
  })

  it('falls back to the default region without a location, as before', async () => {
    await expect(prepare({}, {})).resolves.toEqual({ type: 'PUBLIC', region: DEFAULT_REGION })
    expectNoLocationLookup()
  })

  it('resolves --private-location, as before', async () => {
    await expect(prepare({}, { privateRunLocation: 'office' }))
      .resolves.toEqual({ type: 'PRIVATE', id: 'pl-1', slugName: 'office' })
    expect(api.locations.getAll).not.toHaveBeenCalled()
  })

  it('still rejects both run locations in the config', async () => {
    await expect(prepare({ runLocation: RETIRED, privateRunLocation: 'office' }, {}))
      .rejects.toThrow('Both runLocation and privateRunLocation fields were set')
    expectNoLocationLookup()
  })
})

describe('checkly trigger --location me-south-1', () => {
  it('fails with the retired message before any API call', async () => {
    vi.mocked(loadChecklyConfig).mockRejectedValue(new ConfigNotFoundError(['.'], ['checkly.config.ts']))
    const ctx = createCommandContext({
      command: Trigger,
      parsed: {
        flags: { location: 'me-south-1', env: [], detach: false },
      },
      members: { account: { id: 'acc-1', name: 'Acme' } },
    })

    const err = await rejection(Trigger.prototype.run.call(ctx))

    expect(err).toBeInstanceOf(InvalidInputError)
    expect(err).toHaveProperty('message', MESSAGE)
    expectNoLocationLookup()
  })
})

describe('PwTestCommand.createPlaywrightCheck', () => {
  it('rejects a retired --location, so --create-check writes no config', async () => {
    const err = await rejection(PwTestCommand.createPlaywrightCheck([], RETIRED, undefined, os.tmpdir()))

    expect(err).toBeInstanceOf(InvalidInputError)
    expect(err).toHaveProperty('message', MESSAGE)
  })

  it('keeps a valid --location and the default region, as before', async () => {
    await expect(PwTestCommand.createPlaywrightCheck([], VALID, undefined, os.tmpdir()))
      .resolves.toMatchObject({ locations: ['eu-central-1'] })
    await expect(PwTestCommand.createPlaywrightCheck([], typed(''), undefined, os.tmpdir()))
      .resolves.toMatchObject({ locations: [DEFAULT_REGION] })
  })
})
