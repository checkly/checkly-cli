import chalk from 'chalk'
import { Command } from '@oclif/core'

export default class Bootstrap extends Command {
  static description = 'Bootstrap a Checkly project'

  run (): void {
    this.log('')
    this.log(chalk.yellow.bold('  Heads up!') + ' ' + chalk.yellow('npm create checkly has been replaced by npx checkly init.'))
    this.log('')
    this.log('  To set up Checkly in your project, run:')
    this.log('')
    this.log(`    ${chalk.bold('npx checkly init')}`)
    this.log('')
    this.log(chalk.dim('  The new command includes AI agent skill installation, smarter'))
    this.log(chalk.dim('  project detection, and a streamlined onboarding experience.'))
    this.log('')
  }
}
