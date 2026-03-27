import chalk from 'chalk'
import prompts from 'prompts'
import { copyToClipboard } from './clipboard'
import { makeOnCancel } from './prompts-helpers'

const PROMPT_INDENT = '  '
const MAX_VISIBLE_WIDTH = 80
const MAX_PROMPT_TEXT_WIDTH = MAX_VISIBLE_WIDTH - PROMPT_INDENT.length

export async function displayStarterPrompt (
  promptText: string,
  log: (msg: string) => void,
): Promise<boolean> {
  log('')
  log(chalk.bold('  Starter prompt for your AI agent:'))
  log('')
  log(formatPrompt(promptText))
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
      log(chalk.green('  The prompt is copied to your clipboard!'))
    } else {
      log(chalk.dim('  Could not access clipboard — copy the prompt above manually.'))
    }
    return copied
  }
  return false
}

function formatPrompt (text: string): string {
  return text
    .split('\n')
    .map(wrapAndIndentLine)
    .join('\n')
}

function wrapAndIndentLine (line: string): string {
  if (line.trim() === '') {
    return PROMPT_INDENT
  }

  const wrappedLines: string[] = []
  let currentLine = ''

  for (const segment of line.split(/\s+/)) {
    const chunks = splitLongSegment(segment)

    for (const chunk of chunks) {
      if (currentLine.length === 0) {
        currentLine = chunk
        continue
      }

      if ((currentLine.length + 1 + chunk.length) <= MAX_PROMPT_TEXT_WIDTH) {
        currentLine += ` ${chunk}`
        continue
      }

      wrappedLines.push(currentLine)
      currentLine = chunk
    }
  }

  if (currentLine.length > 0) {
    wrappedLines.push(currentLine)
  }

  return wrappedLines
    .map(wrappedLine => `${PROMPT_INDENT}${wrappedLine}`)
    .join('\n')
}

function splitLongSegment (segment: string): string[] {
  if (segment.length <= MAX_PROMPT_TEXT_WIDTH) {
    return [segment]
  }

  const chunks: string[] = []
  for (let i = 0; i < segment.length; i += MAX_PROMPT_TEXT_WIDTH) {
    chunks.push(segment.slice(i, i + MAX_PROMPT_TEXT_WIDTH))
  }
  return chunks
}
