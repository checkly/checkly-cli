import { readFile } from 'fs/promises'
import { join } from 'path'

import { packageRoot } from '../../services/package-root.js'

// Anchored at the package root (not this module's own depth) so the path also
// resolves when the CLI runs from the esbuild bundle in dist/bundle/.
const PROMPTS_DIR = join(packageRoot(), 'dist/ai-context/onboarding-prompts')

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
