import { describe, expect, it } from 'vitest'
import { BaseCommand } from '../baseCommand.js'

// Import all non-hidden command classes
import ChecksList from '../checks/list.js'
import ChecksGet from '../checks/get.js'
import ChecksStats from '../checks/stats.js'
import StatusPagesList from '../status-pages/list.js'
import StatusPagesGet from '../status-pages/get.js'
import AlertChannelsList from '../alert-channels/list.js'
import AlertChannelsGet from '../alert-channels/get.js'
import AlertChannelsLogs from '../alert-channels/logs.js'
import AssetsList from '../assets/list.js'
import AssetsDownload from '../assets/download.js'
import IncidentsList from '../incidents/list.js'
import IncidentsCreate from '../incidents/create.js'
import IncidentsUpdate from '../incidents/update.js'
import IncidentsResolve from '../incidents/resolve.js'
import EnvLs from '../env/ls.js'
import EnvAdd from '../env/add.js'
import EnvRm from '../env/rm.js'
import EnvUpdate from '../env/update.js'
import EnvPull from '../env/pull.js'
import Deploy from '../deploy.js'
import Destroy from '../destroy.js'
import Test from '../test.js'
import Trigger from '../trigger.js'
import Validate from '../validate.js'
import Login from '../login.js'
import Logout from '../logout.js'
import Whoami from '../whoami.js'
import Switch from '../switch.js'
import Runtimes from '../runtimes.js'
import Rules from '../rules.js'
import ImportPlan from '../import/plan.js'
import ImportApply from '../import/apply.js'
import ImportCommit from '../import/commit.js'
import ImportCancel from '../import/cancel.js'
import PwTest from '../pw-test.js'
import SyncPlaywright from '../sync-playwright.js'
import Skills from '../skills/index.js'
import SkillsInstall from '../skills/install.js'
import AccountPlan from '../account/plan.js'
import Members from '../members.js'
import MembersUpdate from '../members/update.js'
import MembersDelete from '../members/delete.js'
import Api from '../api.js'
import TestSessionsList from '../test-sessions/list.js'
import TestSessionsGet from '../test-sessions/get.js'

const commands: Array<[string, typeof BaseCommand]> = [
  ['api', Api],
  ['members', Members],
  ['members update', MembersUpdate],
  ['members delete', MembersDelete],
  ['account plan', AccountPlan],
  ['alert-channels list', AlertChannelsList],
  ['alert-channels get', AlertChannelsGet],
  ['alert-channels logs', AlertChannelsLogs],
  ['assets list', AssetsList],
  ['assets download', AssetsDownload],
  ['checks list', ChecksList],
  ['checks get', ChecksGet],
  ['checks stats', ChecksStats],
  ['status-pages list', StatusPagesList],
  ['status-pages get', StatusPagesGet],
  ['test-sessions list', TestSessionsList],
  ['test-sessions get', TestSessionsGet],
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
  ['skills', Skills],
  ['skills install', SkillsInstall],
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
