import { runChecklyCli } from '../run-checkly'
import * as config from 'config'
import '../command-matchers'

describe('help', () => {
  it('should print custom help with examples', () => {
    const result = runChecklyCli({
      args: ['--help'],
    })
    expect(result).toHaveStdoutContaining('EXAMPLES')
  })

  it('should print topic help', () => {
    const result = runChecklyCli({
      args: ['env', '--help'],
    })
    // use a 80 char line output
    expect(result).toHaveStdoutContaining(`COMMANDS
  env add     Add environment variable via "checkly env add <key> <value>".
  env ls      List all Checkly environment variables via "checkly env ls".
  env pull    Pull Checkly environment variables via "checkly env pull
              <filename>".
  env rm      Remove environment variable via "checkly env rm <key>".
  env update  Update environment variable via "checkly env update <key>
              <value>".`)
  })

  it('should print core and additional commands and topic', () => {
    const result = runChecklyCli({
      args: ['--help'],
    })
    expect(result).toHaveStdoutContaining(`CORE COMMANDS
  deploy   Deploy your project to your Checkly account.
  test     Test your checks on Checkly.
  trigger  Trigger checks on Checkly`)

    expect(result).toHaveStdoutContaining(`ADDITIONAL COMMANDS
  autocomplete  display autocomplete installation instructions
  destroy       Destroy your project with all its related resources.
  env           Manage Checkly environment variables
  help          Display help for checkly.
  login         Login to your Checkly account or create a new one.
  logout        Log out and clear any local credentials.
  runtimes      List all supported runtimes and dependencies.
  switch        Switch user account.
  whoami        See your currently logged in account and user.`)
  })
})
