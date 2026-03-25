import chalk from 'chalk'
import prompts from 'prompts'
import { copyToClipboard } from './clipboard'
import { makeOnCancel } from './prompts-helpers'

export async function displayStarterPrompt (
  promptText: string,
  log: (msg: string) => void,
): Promise<void> {
  log('')
  log(chalk.bold('  Starter prompt for your AI agent:'))
  log('')
  log(indent(promptText))
  log('')

  const { copy } = await prompts({
    type: 'confirm',
    name: 'copy',
    message: 'Copy prompt to clipboard?',
    initial: true,
  }, { onCancel: makeOnCancel(log) })

  if (copy) {
    const copied = copyToClipboard(promptText)
    if (copied) {
      log(chalk.green('  Copied! Paste it into your AI agent.'))
    } else {
      log(chalk.dim('  Could not access clipboard — copy the prompt above manually.'))
    }
  }
}

function indent (text: string): string {
  return text.split('\n').map(line => `  ${line}`).join('\n')
}
