import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Parser } from '@oclif/core'
import type { View } from '../../rest/views.js'

vi.mock('../../helpers/cli-mode', () => ({
  detectCliMode: vi.fn(() => 'agent'),
}))

vi.mock('../../rest/api', () => ({
  views: { getAll: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  validateAuthentication: vi.fn().mockResolvedValue({ name: 'Test Account' }),
}))

import { detectCliMode } from '../../helpers/cli-mode.js'
import * as api from '../../rest/api.js'
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../rest/errors.js'
import { stripAnsi } from '../../formatters/render.js'
import { AuthCommand } from '../authCommand.js'
import UiViewsList from '../ui-views/list.js'
import UiViewsGet from '../ui-views/get.js'
import UiViewsCreate from '../ui-views/create.js'
import UiViewsUpdate from '../ui-views/update.js'
import UiViewsDelete from '../ui-views/delete.js'

const monitorsView: View = {
  id: '6f1c2a34-5b6d-4e7f-8a9b-0c1d2e3f4a5b',
  page: 'monitors',
  name: 'Failing production',
  filters: { status: ['failing'], tags: ['production', 'critical'] },
  counter: 'failing',
  visibility: 'PRIVATE',
  createdBy: { id: '22222222-2222-2222-2222-222222222222', name: 'Ada Admin', isMember: true },
  canUpdate: true,
  canDelete: true,
  canShare: true,
  hidden: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
}

const sharedTestSessionsView: View = {
  id: '7a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  page: 'testSessions',
  name: 'Main branch',
  filters: { branches: ['main'], statuses: ['FAILED'] },
  counter: null,
  visibility: 'ACCOUNT',
  createdBy: null,
  canUpdate: false,
  canDelete: false,
  canShare: false,
  hidden: true,
  created_at: '2026-01-03T00:00:00.000Z',
  updated_at: '2026-01-03T00:00:00.000Z',
}

const sharedMonitorsView: View = {
  ...monitorsView,
  id: '8b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
  name: 'Team failures',
  visibility: 'ACCOUNT',
}

const serviceKeyError = new ForbiddenError({
  statusCode: 403,
  error: 'Forbidden',
  message: 'A user identity is required.',
})

const legacyKeyError = new UnauthorizedError({
  statusCode: 401,
  error: 'Unauthorized',
  message: 'Unauthorized',
})

const notFoundError = new NotFoundError({
  statusCode: 404,
  error: 'Not Found',
  message: 'View not found',
})

function createCommandContext (
  Command: typeof AuthCommand,
  parsed: { flags: Record<string, unknown>, args?: Record<string, unknown> },
) {
  const logged: string[] = []
  return {
    parse: vi.fn().mockResolvedValue({ metadata: { flags: {} }, ...parsed }),
    error: vi.fn((message: string) => {
      throw new Error(message)
    }),
    log: vi.fn((msg?: string) => {
      if (msg) logged.push(msg)
    }),
    exit: vi.fn((code: number) => {
      throw new Error(`EXIT_${code}`)
    }),
    confirmOrAbort: AuthCommand.prototype.confirmOrAbort,
    style: {
      outputFormat: undefined,
      shortSuccess: vi.fn(),
      longError: vi.fn(),
    },
    constructor: Command,
    logged,
  }
}

function parseUpdate (argv: string[]) {
  return Parser.parse(argv, {
    flags: UiViewsUpdate.flags as any,
    args: UiViewsUpdate.args as any,
    strict: UiViewsUpdate.strict,
  })
}

describe('ui-views commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(detectCliMode).mockReturnValue('agent')
    process.exitCode = undefined
    vi.mocked(api.views.getAll).mockResolvedValue([monitorsView, sharedTestSessionsView])
    vi.mocked(api.views.get).mockResolvedValue(monitorsView)
    vi.mocked(api.views.create).mockResolvedValue(monitorsView)
    vi.mocked(api.views.update).mockResolvedValue(monitorsView)
    vi.mocked(api.views.delete).mockResolvedValue(undefined)
  })

  it('has correct metadata', () => {
    expect(UiViewsList.readOnly).toBe(true)
    expect(UiViewsList.destructive).toBe(false)
    expect(UiViewsList.idempotent).toBe(true)
    expect(UiViewsGet.readOnly).toBe(true)
    expect(UiViewsGet.destructive).toBe(false)
    expect(UiViewsGet.idempotent).toBe(true)
    expect(UiViewsCreate.readOnly).toBe(false)
    expect(UiViewsCreate.destructive).toBe(false)
    expect(UiViewsCreate.idempotent).toBe(false)
    expect(UiViewsUpdate.readOnly).toBe(false)
    expect(UiViewsUpdate.destructive).toBe(false)
    expect(UiViewsUpdate.idempotent).toBe(true)
    expect(UiViewsDelete.readOnly).toBe(false)
    expect(UiViewsDelete.destructive).toBe(true)
    expect(UiViewsDelete.idempotent).toBe(true)
  })

  it.each([
    ['list', UiViewsList],
    ['get', UiViewsGet],
    ['create', UiViewsCreate],
    ['update', UiViewsUpdate],
    ['delete', UiViewsDelete],
  ])('ui-views %s has help examples', (_name, Command) => {
    expect(Command.examples?.length).toBeGreaterThan(0)
  })

  describe('list', () => {
    it('maps --page and --visibility to the API values', async () => {
      const ctx = createCommandContext(UiViewsList, {
        flags: { page: 'test-sessions', visibility: 'account', output: 'table' },
      })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(api.views.getAll).toHaveBeenCalledWith({ page: 'testSessions', visibility: 'ACCOUNT' })
    })

    it('accepts the API spelling of enum values, case-insensitively', async () => {
      const ctx = createCommandContext(UiViewsList, {
        flags: { page: 'testSessions', visibility: 'PRIVATE', output: 'table' },
      })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(api.views.getAll).toHaveBeenCalledWith({ page: 'testSessions', visibility: 'PRIVATE' })
    })

    it('sends no filters when none are passed', async () => {
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'table' } })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(api.views.getAll).toHaveBeenCalledWith({ page: undefined, visibility: undefined })
    })

    it('renders a table with name, page, visibility, counter, creator and id', async () => {
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'table' } })

      await UiViewsList.prototype.run.call(ctx as any)

      const output = stripAnsi(ctx.logged[0])
      expect(output).toContain('NAME')
      expect(output).toContain('PAGE')
      expect(output).toContain('VISIBILITY')
      expect(output).toContain('COUNTER')
      expect(output).toContain('CREATED BY')
      expect(output).toContain('ID')
      const monitorsRow = output.split('\n').find(line => line.includes('Failing production'))
      expect(monitorsRow).toContain('monitors')
      expect(monitorsRow).toContain('private')
      expect(monitorsRow).toContain('failing')
      expect(monitorsRow).toContain('Ada Admin')
      expect(monitorsRow).toContain(monitorsView.id)
      const sharedRow = output.split('\n').find(line => line.includes('Main branch'))
      expect(sharedRow).toContain('test-sessions')
      expect(sharedRow).toContain('account')
      expect(sharedRow).toContain(sharedTestSessionsView.id)
      expect(output).toContain('2 views')
      expect(output).toContain('checkly ui-views get <id>')
    })

    it('wraps the views in a data envelope for json output', async () => {
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'json' } })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(JSON.parse(ctx.logged[0])).toEqual({ data: [monitorsView, sharedTestSessionsView] })
    })

    it('renders markdown output', async () => {
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'md' } })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(ctx.logged[0]).toContain('| Name | Page | Visibility | Counter | Created by | Hidden | ID |')
      expect(ctx.logged[0]).toContain('| Main branch | test-sessions | account | - | - | yes |')
    })

    it('says so when there are no views', async () => {
      vi.mocked(api.views.getAll).mockResolvedValue([])
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'table' } })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(ctx.logged).toEqual(['No views found.'])
    })

    it('returns an empty data envelope for json output when there are no views', async () => {
      vi.mocked(api.views.getAll).mockResolvedValue([])
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'json' } })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(JSON.parse(ctx.logged[0])).toEqual({ data: [] })
    })

    it('rejects an unknown --page before calling the API', async () => {
      const ctx = createCommandContext(UiViewsList, { flags: { page: 'checks', output: 'table' } })

      await expect(UiViewsList.prototype.run.call(ctx as any))
        .rejects.toThrow('Invalid --page "checks". Valid values: monitors, test-sessions.')
      expect(api.views.getAll).not.toHaveBeenCalled()
    })

    it('rejects an unknown --visibility before calling the API', async () => {
      const ctx = createCommandContext(UiViewsList, { flags: { visibility: 'shared', output: 'table' } })

      await expect(UiViewsList.prototype.run.call(ctx as any))
        .rejects.toThrow('Invalid --visibility "shared". Valid values: private, account.')
      expect(api.views.getAll).not.toHaveBeenCalled()
    })

    it('explains that a service API key cannot be used', async () => {
      vi.mocked(api.views.getAll).mockRejectedValue(serviceKeyError)
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'table' } })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith(
        'Failed to list views.',
        expect.stringContaining('service API keys are not accepted'),
      )
      expect(ctx.style.longError).toHaveBeenCalledWith(
        'Failed to list views.',
        expect.stringContaining('Set CHECKLY_API_KEY to a user API key, '
          + 'or unset CHECKLY_API_KEY and CHECKLY_ACCOUNT_ID and run `npx checkly login`.'),
      )
      expect(process.exitCode).toBe(1)
    })

    it('explains that a legacy account API key cannot be used', async () => {
      vi.mocked(api.views.getAll).mockRejectedValue(legacyKeyError)
      const ctx = createCommandContext(UiViewsList, { flags: { output: 'table' } })

      await UiViewsList.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith(
        'Failed to list views.',
        expect.stringContaining('legacy account API keys are not accepted. Set CHECKLY_API_KEY to a user API key'),
      )
      expect(process.exitCode).toBe(1)
    })
  })

  describe('get', () => {
    it('prints the raw view for json output', async () => {
      const ctx = createCommandContext(UiViewsGet, { args: { id: monitorsView.id }, flags: { output: 'json' } })

      await UiViewsGet.prototype.run.call(ctx as any)

      expect(api.views.get).toHaveBeenCalledWith(monitorsView.id)
      expect(JSON.parse(ctx.logged[0])).toEqual(monitorsView)
    })

    it('shows the filters readably in the detail view', async () => {
      const ctx = createCommandContext(UiViewsGet, { args: { id: monitorsView.id }, flags: { output: 'detail' } })

      await UiViewsGet.prototype.run.call(ctx as any)

      const output = stripAnsi(ctx.logged[0])
      expect(output).toContain('Failing production')
      expect(output).toContain('FILTERS')
      expect(output).toMatch(/tags\s+production, critical/)
      expect(output).toMatch(/status\s+failing/)
      expect(output).toContain('checkly ui-views list --page monitors')
    })

    it('reports a missing view', async () => {
      vi.mocked(api.views.get).mockRejectedValue(notFoundError)
      const ctx = createCommandContext(UiViewsGet, { args: { id: 'missing' }, flags: { output: 'detail' } })

      await UiViewsGet.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith('Failed to get view details.', notFoundError)
      expect(process.exitCode).toBe(1)
    })

    it('explains that a service API key cannot be used', async () => {
      vi.mocked(api.views.get).mockRejectedValue(serviceKeyError)
      const ctx = createCommandContext(UiViewsGet, { args: { id: monitorsView.id }, flags: { output: 'json' } })

      await UiViewsGet.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith(
        'Failed to get view details.',
        expect.stringContaining('need a user API key'),
      )
      expect(process.exitCode).toBe(1)
    })
  })

  describe('create', () => {
    const createFlags = {
      'page': 'monitors',
      'name': 'Failing production',
      'filters': '{"status":["failing"],"tags":["production","critical"]}',
      'counter': 'failing',
      'output': 'json',
      'force': true,
      'dry-run': false,
    }

    it('maps the flags to the request body and prints the raw view', async () => {
      const ctx = createCommandContext(UiViewsCreate, { flags: createFlags })

      await UiViewsCreate.prototype.run.call(ctx as any)

      expect(api.views.create).toHaveBeenCalledWith({
        page: 'monitors',
        name: 'Failing production',
        filters: { status: ['failing'], tags: ['production', 'critical'] },
        counter: 'failing',
      })
      expect(JSON.parse(ctx.logged[0])).toEqual(monitorsView)
    })

    it('maps --page test-sessions and leaves the counter out', async () => {
      vi.mocked(api.views.create).mockResolvedValue({ ...sharedTestSessionsView, visibility: 'PRIVATE' })
      const ctx = createCommandContext(UiViewsCreate, {
        flags: { ...createFlags, page: 'test-sessions', filters: '{"branches":["main"]}', counter: undefined },
      })

      await UiViewsCreate.prototype.run.call(ctx as any)

      const [payload] = vi.mocked(api.views.create).mock.calls[0]
      expect(payload).toEqual({ page: 'testSessions', name: 'Failing production', filters: { branches: ['main'] } })
      expect(payload).not.toHaveProperty('visibility')
    })

    it('asks for confirmation in agent mode without --force', async () => {
      const ctx = createCommandContext(UiViewsCreate, { flags: { ...createFlags, force: false } })

      await expect(UiViewsCreate.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

      const output = JSON.parse(ctx.logged[0])
      expect(output.status).toBe('confirmation_required')
      expect(output.command).toBe('ui-views create')
      expect(output.changes[0]).toBe('Create private view "Failing production" on the monitors page')
      expect(output.confirmCommand).toContain('npx checkly ui-views create')
      expect(output.confirmCommand).toContain('--filters="{\\"status\\":[\\"failing\\"],\\"tags\\":[\\"production\\",\\"critical\\"]}"')
      expect(output.confirmCommand).toContain('--force')
      expect(api.views.create).not.toHaveBeenCalled()
    })

    it('previews without creating on --dry-run', async () => {
      const ctx = createCommandContext(UiViewsCreate, { flags: { ...createFlags, 'force': false, 'dry-run': true } })

      await expect(UiViewsCreate.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

      expect(JSON.parse(ctx.logged[0]).status).toBe('dry_run')
      expect(api.views.create).not.toHaveBeenCalled()
    })

    it('offers the share hint only when the caller can share the view', async () => {
      const shareable = createCommandContext(UiViewsCreate, { flags: { ...createFlags, output: 'table' } })
      await UiViewsCreate.prototype.run.call(shareable as any)
      expect(stripAnsi(shareable.logged.join('\n'))).toContain(`checkly ui-views update ${monitorsView.id} --share`)

      vi.mocked(api.views.create).mockResolvedValue({ ...monitorsView, canShare: false })
      const unshareable = createCommandContext(UiViewsCreate, { flags: { ...createFlags, output: 'table' } })
      await UiViewsCreate.prototype.run.call(unshareable as any)
      const output = stripAnsi(unshareable.logged.join('\n'))
      expect(output).not.toContain('--share')
      expect(output).toContain('checkly ui-views list --page monitors')
    })

    it('rejects --filters that is not JSON', async () => {
      const ctx = createCommandContext(UiViewsCreate, { flags: { ...createFlags, filters: '{tags:production}' } })

      await expect(UiViewsCreate.prototype.run.call(ctx as any)).rejects.toThrow('Invalid JSON in --filters')
      expect(api.views.create).not.toHaveBeenCalled()
    })

    it.each(['["production"]', 'null', '"production"'])('rejects --filters %s because it is not an object', async filters => {
      const ctx = createCommandContext(UiViewsCreate, { flags: { ...createFlags, filters } })

      await expect(UiViewsCreate.prototype.run.call(ctx as any)).rejects.toThrow('--filters must be a JSON object')
      expect(api.views.create).not.toHaveBeenCalled()
    })

    it('rejects --counter on a test sessions view', async () => {
      const ctx = createCommandContext(UiViewsCreate, { flags: { ...createFlags, page: 'test-sessions' } })

      await expect(UiViewsCreate.prototype.run.call(ctx as any))
        .rejects.toThrow('--counter is only supported on monitors views.')
      expect(api.views.create).not.toHaveBeenCalled()
    })

    it('rejects an unknown --counter', async () => {
      const ctx = createCommandContext(UiViewsCreate, { flags: { ...createFlags, counter: 'none' } })

      await expect(UiViewsCreate.prototype.run.call(ctx as any))
        .rejects.toThrow('Invalid --counter "none". Valid values: total, passing, degraded, failing.')
    })

    it('surfaces the view limit', async () => {
      const limitError = new ValidationError({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Maximum of 10 private views reached',
      })
      vi.mocked(api.views.create).mockRejectedValue(limitError)
      const ctx = createCommandContext(UiViewsCreate, { flags: createFlags })

      await UiViewsCreate.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith('Failed to create view.', limitError)
      expect(process.exitCode).toBe(1)
    })

    it('explains that a service API key cannot be used', async () => {
      vi.mocked(api.views.create).mockRejectedValue(serviceKeyError)
      const ctx = createCommandContext(UiViewsCreate, { flags: createFlags })

      await UiViewsCreate.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith(
        'Failed to create view.',
        expect.stringContaining('service API keys are not accepted'),
      )
      expect(process.exitCode).toBe(1)
    })
  })

  describe('update', () => {
    const updateFlags = {
      'output': 'json',
      'force': true,
      'dry-run': false,
    }

    it('requires at least one change', async () => {
      const ctx = createCommandContext(UiViewsUpdate, { args: { id: monitorsView.id }, flags: updateFlags })

      await expect(UiViewsUpdate.prototype.run.call(ctx as any))
        .rejects.toThrow('Nothing to update. Pass at least one of --name, --filters, --counter, --share or --private.')
      expect(api.views.get).not.toHaveBeenCalled()
      expect(api.views.update).not.toHaveBeenCalled()
    })

    it('maps --name, --filters and --counter to the request body', async () => {
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, name: 'Renamed', filters: '{"tags":["staging"]}', counter: 'degraded' },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(api.views.update).toHaveBeenCalledWith(monitorsView.id, {
        name: 'Renamed',
        filters: { tags: ['staging'] },
        counter: 'degraded',
      })
      expect(JSON.parse(ctx.logged[0])).toEqual(monitorsView)
    })

    it('clears the counter with --counter none', async () => {
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, counter: 'none' },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(api.views.update).toHaveBeenCalledWith(monitorsView.id, { counter: null })
    })

    it('maps --share to ACCOUNT visibility', async () => {
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, share: true },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(api.views.update).toHaveBeenCalledWith(monitorsView.id, { visibility: 'ACCOUNT' })
    })

    it('maps --private to PRIVATE visibility', async () => {
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, private: true },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(api.views.update).toHaveBeenCalledWith(monitorsView.id, { visibility: 'PRIVATE' })
    })

    it('allows clearing the counter of a test sessions view', async () => {
      vi.mocked(api.views.get).mockResolvedValue({ ...sharedTestSessionsView, canUpdate: true })
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: sharedTestSessionsView.id },
        flags: { ...updateFlags, counter: 'none' },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(api.views.update).toHaveBeenCalledWith(sharedTestSessionsView.id, { counter: null })
    })

    it.each([
      ['its creator, who is still a member', monitorsView.createdBy, 'Ada Admin'],
      ['you, when the creator left the account', { ...monitorsView.createdBy!, isMember: false }, 'you'],
      ['you, when the view has no creator', null, 'you'],
    ])('previews making a shared view private for %s', async (_case, createdBy, owner) => {
      vi.mocked(api.views.get).mockResolvedValue({ ...sharedMonitorsView, createdBy })
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: sharedMonitorsView.id },
        flags: { ...updateFlags, force: false, private: true },
      })

      await expect(UiViewsUpdate.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

      expect(JSON.parse(ctx.logged[0]).changes).toEqual([
        `Update view "Team failures" (${sharedMonitorsView.id}) on the monitors page`,
        `Make private: only ${owner} will see it, and it is removed for everyone else on the account`,
      ])
      expect(api.views.update).not.toHaveBeenCalled()
    })

    it.each([
      ['--share on a shared view', sharedMonitorsView, { share: true }],
      ['--private on a private view', monitorsView, { private: true }],
    ])('previews no visibility change for %s', async (_case, view, visibilityFlag) => {
      vi.mocked(api.views.get).mockResolvedValue({ ...view, canShare: false })
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: view.id },
        flags: { ...updateFlags, force: false, ...visibilityFlag },
      })

      await expect(UiViewsUpdate.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

      expect(JSON.parse(ctx.logged[0]).changes).toEqual([
        `Update view "${view.name}" (${view.id}) on the monitors page`,
      ])
    })

    it('previews without updating on --dry-run', async () => {
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, 'force': false, 'dry-run': true, 'name': 'Renamed' },
      })

      await expect(UiViewsUpdate.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

      const output = JSON.parse(ctx.logged[0])
      expect(output.status).toBe('dry_run')
      expect(output.changes).toContain('Rename to "Renamed"')
      expect(api.views.update).not.toHaveBeenCalled()
    })

    it.each([
      [
        'editing without canUpdate',
        { ...sharedMonitorsView, canUpdate: false },
        { name: 'Renamed' },
        'Editing shared views requires the views:update permission',
      ],
      [
        'sharing without canShare',
        { ...monitorsView, canShare: false },
        { share: true },
        'Sharing views requires the views:share permission',
      ],
      [
        'making a shared view private without canShare',
        { ...sharedMonitorsView, canShare: false },
        { private: true },
        'Making shared views private requires the views:delete permission',
      ],
    ])('refuses %s before calling the API', async (_case, view, changeFlags, message) => {
      vi.mocked(api.views.get).mockResolvedValue(view)
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: view.id },
        flags: { ...updateFlags, ...changeFlags },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith('Failed to update view.', message)
      expect(process.exitCode).toBe(1)
      expect(ctx.logged).toEqual([])
      expect(api.views.update).not.toHaveBeenCalled()
    })

    it('rejects --share together with --private', async () => {
      await expect(parseUpdate([monitorsView.id, '--share', '--private']))
        .rejects.toThrow(/cannot also be provided when using/)
    })

    it('accepts --share or --private on its own', async () => {
      expect((await parseUpdate([monitorsView.id, '--share'])).flags.share).toBe(true)
      expect((await parseUpdate([monitorsView.id, '--private'])).flags.private).toBe(true)
    })

    it('rejects an unknown --counter', async () => {
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, counter: 'errors' },
      })

      await expect(UiViewsUpdate.prototype.run.call(ctx as any))
        .rejects.toThrow('Invalid --counter "errors". Valid values: total, passing, degraded, failing, none.')
      expect(api.views.update).not.toHaveBeenCalled()
    })

    it('rejects a counter on a test sessions view', async () => {
      vi.mocked(api.views.get).mockResolvedValue(sharedTestSessionsView)
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: sharedTestSessionsView.id },
        flags: { ...updateFlags, counter: 'total' },
      })

      await expect(UiViewsUpdate.prototype.run.call(ctx as any))
        .rejects.toThrow('--counter is only supported on monitors views.')
      expect(api.views.update).not.toHaveBeenCalled()
    })

    it('asks for confirmation in agent mode without --force', async () => {
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, force: false, share: true },
      })

      await expect(UiViewsUpdate.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

      const output = JSON.parse(ctx.logged[0])
      expect(output.status).toBe('confirmation_required')
      expect(output.command).toBe('ui-views update')
      expect(output.changes).toEqual([
        `Update view "Failing production" (${monitorsView.id}) on the monitors page`,
        'Share with everyone on the account',
      ])
      expect(output.confirmCommand).toBe(`npx checkly ui-views update ${monitorsView.id} --share --force`)
      expect(api.views.update).not.toHaveBeenCalled()
    })

    it('reports a missing view without updating', async () => {
      vi.mocked(api.views.get).mockRejectedValue(notFoundError)
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: 'missing' },
        flags: { ...updateFlags, name: 'Renamed' },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith('Failed to update view.', notFoundError)
      expect(api.views.update).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(1)
    })

    it('surfaces a missing permission', async () => {
      const permissionError = new ForbiddenError({
        statusCode: 403,
        error: 'Forbidden',
        message: 'Sharing views requires the views:share permission',
      })
      vi.mocked(api.views.update).mockRejectedValue(permissionError)
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, share: true },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith('Failed to update view.', permissionError)
      expect(process.exitCode).toBe(1)
    })

    it('surfaces the shared view limit', async () => {
      const limitError = new ValidationError({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Maximum of 10 shared views reached',
      })
      vi.mocked(api.views.update).mockRejectedValue(limitError)
      const ctx = createCommandContext(UiViewsUpdate, {
        args: { id: monitorsView.id },
        flags: { ...updateFlags, share: true },
      })

      await UiViewsUpdate.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith('Failed to update view.', limitError)
      expect(process.exitCode).toBe(1)
    })
  })

  describe('delete', () => {
    const deleteFlags = { 'force': false, 'dry-run': false }

    it('asks for confirmation in agent mode without --force', async () => {
      vi.mocked(api.views.get).mockResolvedValue({ ...sharedTestSessionsView, canDelete: true })
      const ctx = createCommandContext(UiViewsDelete, { args: { id: sharedTestSessionsView.id }, flags: deleteFlags })

      await expect(UiViewsDelete.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

      const output = JSON.parse(ctx.logged[0])
      expect(output.status).toBe('confirmation_required')
      expect(output.command).toBe('ui-views delete')
      expect(output.classification.destructive).toBe(true)
      expect(output.changes).toEqual([
        `Delete view "Main branch" (${sharedTestSessionsView.id}) from the test-sessions page`,
        'The view is shared, so it is removed for everyone on the account',
      ])
      expect(output.confirmCommand).toBe(`npx checkly ui-views delete ${sharedTestSessionsView.id} --force`)
      expect(api.views.delete).not.toHaveBeenCalled()
    })

    it('does not warn about other members when deleting a private view', async () => {
      const ctx = createCommandContext(UiViewsDelete, { args: { id: monitorsView.id }, flags: deleteFlags })

      await expect(UiViewsDelete.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_2')

      expect(JSON.parse(ctx.logged[0]).changes).toEqual([
        `Delete view "Failing production" (${monitorsView.id}) from the monitors page`,
      ])
      expect(api.views.delete).not.toHaveBeenCalled()
    })

    it('previews without deleting on --dry-run', async () => {
      const ctx = createCommandContext(UiViewsDelete, {
        args: { id: monitorsView.id },
        flags: { ...deleteFlags, 'dry-run': true },
      })

      await expect(UiViewsDelete.prototype.run.call(ctx as any)).rejects.toThrow('EXIT_0')

      expect(JSON.parse(ctx.logged[0]).status).toBe('dry_run')
      expect(api.views.delete).not.toHaveBeenCalled()
    })

    it('refuses to delete without canDelete before calling the API', async () => {
      vi.mocked(api.views.get).mockResolvedValue(sharedTestSessionsView)
      const ctx = createCommandContext(UiViewsDelete, {
        args: { id: sharedTestSessionsView.id },
        flags: { ...deleteFlags, force: true },
      })

      await UiViewsDelete.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith(
        'Failed to delete view.',
        'Deleting shared views requires the views:delete permission',
      )
      expect(process.exitCode).toBe(1)
      expect(ctx.logged).toEqual([])
      expect(api.views.delete).not.toHaveBeenCalled()
    })

    it('deletes with --force', async () => {
      const ctx = createCommandContext(UiViewsDelete, {
        args: { id: monitorsView.id },
        flags: { ...deleteFlags, force: true },
      })

      await UiViewsDelete.prototype.run.call(ctx as any)

      expect(api.views.delete).toHaveBeenCalledWith(monitorsView.id)
      expect(ctx.style.shortSuccess).toHaveBeenCalledWith('View "Failing production" deleted.')
    })

    it('reports a missing view without deleting', async () => {
      vi.mocked(api.views.get).mockRejectedValue(notFoundError)
      const ctx = createCommandContext(UiViewsDelete, {
        args: { id: 'missing' },
        flags: { ...deleteFlags, force: true },
      })

      await UiViewsDelete.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith('Failed to delete view.', notFoundError)
      expect(api.views.delete).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(1)
    })

    it('explains that a service API key cannot be used', async () => {
      vi.mocked(api.views.get).mockRejectedValue(serviceKeyError)
      const ctx = createCommandContext(UiViewsDelete, {
        args: { id: monitorsView.id },
        flags: { ...deleteFlags, force: true },
      })

      await UiViewsDelete.prototype.run.call(ctx as any)

      expect(ctx.style.longError).toHaveBeenCalledWith(
        'Failed to delete view.',
        expect.stringContaining('service API keys are not accepted'),
      )
      expect(api.views.delete).not.toHaveBeenCalled()
      expect(process.exitCode).toBe(1)
    })
  })
})
