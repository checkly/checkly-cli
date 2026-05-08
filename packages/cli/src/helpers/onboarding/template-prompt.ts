import { readFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PROMPTS_DIR = join(__dirname, '../../ai-context/onboarding-prompts')

export type PromptVariables = Record<string, string>

export async function loadPromptTemplate (
  templateName: string,
  variables: PromptVariables,
): Promise<string> {
  const templatePath = join(PROMPTS_DIR, `${templateName}.md`)
  let content = await readFile(templatePath, 'utf8')

  for (const [key, value] of Object.entries(variables)) {
    content = content.replaceAll(`{{${key}}}`, value)
  }

  return content.trim()
}
