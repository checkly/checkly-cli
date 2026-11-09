import os from 'node:os'

import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  locations: { getAll: vi.fn() },
}))

/**
 * `trigger` calls the API client module directly; the `test` and `pw-test`
 * helper gets the same object as its `api` argument.
 */
vi.mock('../../rest/api', async importOriginal => ({
  ...await importOriginal<typeof import('../../rest/api.js')>(),
  locations: api.locations,
}))

import PwTestCommand from '../../commands/pw-test.js'
import Trigger from '../../commands/trigger.js'
import { createCommandContext } from '../../commands/__tests__/helpers/command-context.js'
import type { Region } from '../../index.js'
import type { RunLocation } from '../../services/abstract-check-runner.js'
import { retiredRegionMessage } from '../constants.js'
import { exitCodeFor, InvalidInputError } from '../invalid-input-error.js'
import { prepareRunLocation } from '../test-helper.js'

/**
 * `me-south-1` is no longer a key of `Region`. The commands cast the raw
 * `--location` string the same way, and a JavaScript config passes it as is.
 */
const RETIRED = 'me-south-1' as keyof Region
const VALID = 'eu-central-1' as keyof Region
const MESSAGE = retiredRegionMessage('me-south-1')

type RunLocationOptions = { runLocation?: keyof Region, privateRunLocation?: string }
type Prepare = (configOptions: RunLocationOptions, cliFlags: RunLocationOptions) => Promise<RunLocation>

/** `test` and `pw-test` share one implementation; `trigger` has its own. */
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

beforeEach(() => {
  vi.clearAllMocks()
  /** The API may still list a retired location, so the CLI has to stop it itself. */
  api.locations.getAll.mockResolvedValue({ data: [{ region: 'eu-central-1' }, { region: 'me-south-1' }] })
})

describe.each(implementations)('prepareRunLocation in %s', (_name, prepare) => {
  it('rejects a retired --location before any API call, as invalid input', async () => {
    const err = await rejection(prepare({}, { runLocation: RETIRED }))

    expect(err).toBeInstanceOf(InvalidInputError)
    expect(err).toHaveProperty('message', MESSAGE)
    expect(exitCodeFor(err)).toBe(2)
    expect(api.locations.getAll).not.toHaveBeenCalled()
  })

  it('rejects a retired cli.runLocation as invalid configuration', async () => {
    const err = await rejection(prepare({ runLocation: RETIRED }, {}))

    expect(err).not.toBeInstanceOf(InvalidInputError)
    expect(err).toHaveProperty('message', MESSAGE)
    expect(exitCodeFor(err)).toBe(1)
    expect(api.locations.getAll).not.toHaveBeenCalled()
  })

  it('returns a valid cli.runLocation without an API call', async () => {
    await expect(prepare({ runLocation: VALID }, {})).resolves.toEqual({ type: 'PUBLIC', region: 'eu-central-1' })
    expect(api.locations.getAll).not.toHaveBeenCalled()
  })

  it('lets a valid --location win over a retired cli.runLocation', async () => {
    await expect(prepare({ runLocation: RETIRED }, { runLocation: VALID }))
      .resolves.toEqual({ type: 'PUBLIC', region: 'eu-central-1' })
  })
})

describe('PwTestCommand.createPlaywrightCheck', () => {
  it('rejects a retired --location, so --create-check writes no config', async () => {
    const err = await rejection(PwTestCommand.createPlaywrightCheck([], RETIRED, undefined, os.tmpdir()))

    expect(err).toBeInstanceOf(InvalidInputError)
    expect(err).toHaveProperty('message', MESSAGE)
  })
})
