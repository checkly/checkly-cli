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

const commands: Array<[string, typeof BaseCommand]> = [
  ['checks list', ChecksList],
  ['checks get', ChecksGet],
  ['status-pages list', StatusPagesList],
  ['status-pages get', StatusPagesGet],
  ['incidents list', IncidentsList],
  ['incidents create', IncidentsCreate],
  ['incidents update', IncidentsUpdate],
  ['incidents resolve', IncidentsResolve],
  ['env ls', EnvLs],
  ['env add', EnvAdd],
  ['env rm', EnvRm],
  ['env update', EnvUpdate],
  ['env pull', EnvPull],
  ['deploy', Deploy],
  ['destroy', Destroy],
  ['test', Test],
  ['trigger', Trigger],
  ['validate', Validate],
  ['login', Login],
  ['logout', Logout],
  ['whoami', Whoami],
  ['switch', Switch],
  ['runtimes', Runtimes],
  ['rules', Rules],
  ['import plan', ImportPlan],
  ['import apply', ImportApply],
  ['import commit', ImportCommit],
  ['import cancel', ImportCancel],
  ['pw-test', PwTest],
  ['sync-playwright', SyncPlaywright],
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
