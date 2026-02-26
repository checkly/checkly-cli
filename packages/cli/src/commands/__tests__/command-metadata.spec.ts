import { describe, expect, it } from 'vitest'
import { BaseCommand } from '../baseCommand'

// Import all non-hidden command classes
import ChecksList from '../checks/list'
import ChecksGet from '../checks/get'
import StatusPagesList from '../status-pages/list'
import StatusPagesGet from '../status-pages/get'
import IncidentsList from '../incidents/list'
import IncidentsCreate from '../incidents/create'
import IncidentsUpdate from '../incidents/update'
import IncidentsResolve from '../incidents/resolve'
import EnvLs from '../env/ls'
import EnvAdd from '../env/add'
import EnvRm from '../env/rm'
import EnvUpdate from '../env/update'
import EnvPull from '../env/pull'
import Deploy from '../deploy'
import Destroy from '../destroy'
import Test from '../test'
import Trigger from '../trigger'
import Validate from '../validate'
import Login from '../login'
import Logout from '../logout'
import Whoami from '../whoami'
import Switch from '../switch'
import Runtimes from '../runtimes'
import Rules from '../rules'
import ImportPlan from '../import/plan'
import ImportApply from '../import/apply'
import ImportCommit from '../import/commit'
import ImportCancel from '../import/cancel'
import PwTest from '../pw-test'
import SyncPlaywright from '../sync-playwright'

type CommandClass = typeof BaseCommand & {
  readOnly: boolean
  destructive: boolean
  idempotent: boolean
}

const commands: Array<[string, CommandClass]> = [
  ['checks list', ChecksList as any],
  ['checks get', ChecksGet as any],
  ['status-pages list', StatusPagesList as any],
  ['status-pages get', StatusPagesGet as any],
  ['incidents list', IncidentsList as any],
  ['incidents create', IncidentsCreate as any],
  ['incidents update', IncidentsUpdate as any],
  ['incidents resolve', IncidentsResolve as any],
  ['env ls', EnvLs as any],
  ['env add', EnvAdd as any],
  ['env rm', EnvRm as any],
  ['env update', EnvUpdate as any],
  ['env pull', EnvPull as any],
  ['deploy', Deploy as any],
  ['destroy', Destroy as any],
  ['test', Test as any],
  ['trigger', Trigger as any],
  ['validate', Validate as any],
  ['login', Login as any],
  ['logout', Logout as any],
  ['whoami', Whoami as any],
  ['switch', Switch as any],
  ['runtimes', Runtimes as any],
  ['rules', Rules as any],
  ['import plan', ImportPlan as any],
  ['import apply', ImportApply as any],
  ['import commit', ImportCommit as any],
  ['import cancel', ImportCancel as any],
  ['pw-test', PwTest as any],
  ['sync-playwright', SyncPlaywright as any],
]

describe('command metadata', () => {
  it.each(commands)('%s has boolean readOnly', (name, Command) => {
    expect(typeof Command.readOnly).toBe('boolean')
  })

  it.each(commands)('%s has boolean destructive', (name, Command) => {
    expect(typeof Command.destructive).toBe('boolean')
  })

  it.each(commands)('%s has boolean idempotent', (name, Command) => {
    expect(typeof Command.idempotent).toBe('boolean')
  })

  it('read-only commands are never destructive', () => {
    for (const [name, Command] of commands) {
      if (Command.readOnly) {
        expect(Command.destructive, `${name} is readOnly but also destructive`).toBe(false)
      }
    }
  })

  it('destructive commands are never read-only', () => {
    for (const [name, Command] of commands) {
      if (Command.destructive) {
        expect(Command.readOnly, `${name} is destructive but also readOnly`).toBe(false)
      }
    }
  })
})
