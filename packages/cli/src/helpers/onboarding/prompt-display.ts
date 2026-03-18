import chalk from 'chalk'
import prompts from 'prompts'
import { copyToClipboard } from './clipboard'

const PREVIEW_LINES = 5
const SEPARATOR = chalk.cyan('━'.repeat(55))

export function formatPromptPreview (text: string, maxLines: number = PREVIEW_LINES): string {
  const lines = text.split('\n')
  if (lines.length <= maxLines) {
    return text
  }
  return lines.slice(0, maxLines).join('\n') + '\n' + chalk.dim(`... (${lines.length - maxLines} more lines)`)
}

export async function displayStarterPrompt (
  promptText: string,
  log: (msg: string) => void,
): Promise<void> {
  const copied = copyToClipboard(promptText)

  log('')
  log(SEPARATOR)
  if (copied) {
    log(chalk.green.bold('  Copied to clipboard!'))
    log(chalk.bold('  Paste this into your AI agent to get started:'))
  } else {
    log(chalk.bold('  Copy the prompt below and paste it into your AI agent to get started:'))
  }
  log(SEPARATOR)
  log('')

  const isLong = promptText.split('\n').length > PREVIEW_LINES
  if (isLong) {
    const preview = formatPromptPreview(promptText)
    log(indent(preview))
    log('')

    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'View full prompt?',
      choices: [
        { title: copied ? 'Continue (prompt is in clipboard)' : 'Continue', value: 'continue' },
        { title: 'Show full prompt', value: 'expand' },
      ],
      initial: copied ? 0 : 1,
    })

    if (action === 'expand') {
      log('')
      log(indent(promptText))
    }
  } else {
    log(indent(promptText))
  }

  log('')
  log(SEPARATOR)
}

function indent (text: string): string {
  return text.split('\n').map(line => `  ${line}`).join('\n')
}
