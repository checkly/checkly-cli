import { describe, it, expect } from 'vitest'

import { runChecklyCli } from '../run-checkly'

describe('help', () => {
  it('should print custom help with examples', async () => {
    const { stdout } = await runChecklyCli({
      args: ['--help'],
    })
    expect(stdout).toContain('EXAMPLES')
  })

  it('should print topic help', async () => {
    const { stdout } = await runChecklyCli({
      args: ['env', '--help'],
    })
    // use a 80 char line output
    expect(stdout).toContain(`COMMANDS
  env add     Add environment variable via "checkly env add <key> <value>".
  env ls      List all Checkly environment variables via "checkly env ls".
  env pull    Pull Checkly environment variables via "checkly env pull
              <filename>".
  env rm      Remove environment variable via "checkly env rm <key>".
  env update  Update environment variable via "checkly env update <key>
              <value>".`)
  })

  it('should print import topic help', async () => {
    const { stdout } = await runChecklyCli({
      args: ['import', '--help'],
    })
    // use a 80 char line output
    expect(stdout).toContain(`COMMANDS
  import apply   Attach imported resources into your project in a pending state.
  import cancel  Cancels an ongoing import plan that has not been committed yet.
  import commit  Permanently commit imported resources into your project.
  import plan    Begin the import process by creating a plan.`)
  })

  it('should print core and additional commands and topic', async () => {
    const { stdout } = await runChecklyCli({
      args: ['--help'],
    })
    expect(stdout).toContain(`CORE COMMANDS
  deploy   Deploy your project to your Checkly account.
  test     Test your checks on Checkly.
  trigger  Trigger your existing checks on Checkly.`)

    expect(stdout).toContain(`ADDITIONAL COMMANDS
  destroy          Destroy your project with all its related resources.
  env              Manage Checkly environment variables.
  help             Display help for checkly.
  import           Import existing resources from your Checkly account to your project.
  login            Login to your Checkly account or create a new one.
  logout           Log out and clear any local credentials.
  runtimes         List all supported runtimes and dependencies.
  switch           Switch user account.
  sync-playwright  Copy Playwright config into the Checkly config file.
  whoami           See your currently logged in account and user.`)
  })
})
