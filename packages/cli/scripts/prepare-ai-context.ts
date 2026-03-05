import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { ACTIONS, EXAMPLE_CONFIGS, REFERENCES } from '../src/ai-context/context'

const EXAMPLES_DIR = join(__dirname, '../gen/')
const AI_CONTEXT_DIR = join(__dirname, '../src/ai-context')
const RULES_OUTPUT_DIR = join(__dirname, '../dist/ai-context')

// Reference files served by the CLI's `checkly skills [action] [reference]` command
const COMMAND_REFERENCES_DIR = join(__dirname, '../dist/ai-context/skills-command/references')

// Published skill directory copied to the repo root (SKILL.md + README.md only, no references)
const PUBLIC_SKILLS_DIR = join(__dirname, '../dist/ai-context/public-skills')
const PUBLIC_SKILL_DIR = join(PUBLIC_SKILLS_DIR, 'checkly')

function stripYamlFrontmatter (content: string): string {
  const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/
  return content.replace(frontmatterRegex, '')
}

// Demote headings by two levels (# -> ###, ## -> ####) to maintain proper
// heading hierarchy in checkly.rules.md.
function demoteHeadings (content: string): string {
  return content.replace(/^(#+)/gm, '##$1')
}

function normalizeBlankLines (content: string): string {
  return content.replace(/\n{3,}/g, '\n\n')
}

async function writeOutput (content: string, dir: string, filename: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  const outputPath = join(dir, filename)
  await writeFile(outputPath, content, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`Wrote ${outputPath}`)
}

async function readExampleCode (): Promise<Map<string, string>> {
  const examples = new Map<string, string>()

  for (const [key, config] of Object.entries(EXAMPLE_CONFIGS)) {
    let code: string | undefined

    if (config.exampleConfig) {
      code = config.exampleConfig
    } else if (config.exampleConfigPath) {
      const filePath = join(EXAMPLES_DIR, config.exampleConfigPath)
      try {
        code = await readFile(filePath, 'utf8')
      } catch {
        // eslint-disable-next-line no-console
        console.warn(
          `Warning: Could not read example for ${key} from ${filePath}. It might not exist or be accessible.`,
        )
      }
    }

    if (code) {
      const wrappedCode = `**Reference:** ${config.reference}\n\n\`\`\`typescript\n${code}\`\`\``
      examples.set(config.templateString, wrappedCode)
    }
  }

  return examples
}

function replaceExamples (content: string, examples: Map<string, string>): string {
  let result = content
  for (const [templateString, code] of examples) {
    result = result.replaceAll(templateString, code)
  }
  return result
}

function generateSkillCommands (): string {
  return ACTIONS.map(action => {
    const lines = [
      `### \`npx checkly skills ${action.id}\``,
      action.description,
    ]

    if ('references' in action) {
      for (const ref of action.references) {
        const refId = ref.id.replace(`${action.id}-`, '')
        lines.push('')
        lines.push(`#### \`npx checkly skills ${action.id} ${refId}\``)
        lines.push(ref.description)
      }
    }

    return lines.join('\n')
  }).join('\n\n')
}

function generateReferenceCommands (): string {
  return REFERENCES.map(ref => {
    const refId = ref.id.replace('configure-', '')
    return `### \`npx checkly skills configure ${refId}\`\n${ref.description}`
  }).join('\n\n')
}

function generateActionReferenceCommands (
  actionId: string,
  references: ReadonlyArray<{ id: string, description: string }>,
): string {
  return references.map(ref => {
    const refId = ref.id.replace(`${actionId}-`, '')
    return `### \`npx checkly skills ${actionId} ${refId}\`\n${ref.description}`
  }).join('\n\n')
}

async function prepareContext () {
  try {
    // eslint-disable-next-line no-console
    console.log('📝 Preparing AI context...')

    const examples = await readExampleCode()

    // Process configure-* reference files and collect their content
    const referenceContents: string[] = []

    for (const ref of REFERENCES) {
      const refContent = await readFile(
        join(AI_CONTEXT_DIR, 'references', `${ref.id}.md`),
        'utf8',
      )
      const processedRefContent = replaceExamples(refContent, examples)
      referenceContents.push(processedRefContent)

      // Write reference file to skill output
      await writeOutput(processedRefContent, COMMAND_REFERENCES_DIR, `${ref.id}.md`)
    }

    // Process configure.md (action header with reference links/commands + examples)
    let configureContent = await readFile(join(AI_CONTEXT_DIR, 'references', 'configure.md'), 'utf8')
    configureContent = configureContent
      .replace('<!-- REFERENCE_COMMANDS -->', generateReferenceCommands())
    configureContent = replaceExamples(configureContent, examples)
    await writeOutput(configureContent, COMMAND_REFERENCES_DIR, 'configure.md')

    // Process actions with references (investigate, communicate, etc.)
    for (const action of ACTIONS) {
      if (!('references' in action) || action.id === 'configure') continue

      for (const ref of action.references) {
        const refContent = await readFile(
          join(AI_CONTEXT_DIR, 'references', `${ref.id}.md`),
          'utf8',
        )
        await writeOutput(refContent, COMMAND_REFERENCES_DIR, `${ref.id}.md`)
      }

      let actionContent = await readFile(join(AI_CONTEXT_DIR, 'references', `${action.id}.md`), 'utf8')
      actionContent = actionContent
        .replace('<!-- REFERENCE_COMMANDS -->', generateActionReferenceCommands(action.id, action.references))
      await writeOutput(actionContent, COMMAND_REFERENCES_DIR, `${action.id}.md`)
    }

    // Process initialize.md (no templating needed currently)
    const initializeContent = await readFile(join(AI_CONTEXT_DIR, 'references', 'initialize.md'), 'utf8')
    await writeOutput(initializeContent, COMMAND_REFERENCES_DIR, 'initialize.md')

    // Generate SKILL.md from skill.md template with action links/commands
    let skillTemplate = await readFile(join(AI_CONTEXT_DIR, 'skill.md'), 'utf8')
    skillTemplate = skillTemplate
      .replace('<!-- SKILL_COMMANDS -->', generateSkillCommands())
    await writeOutput(skillTemplate, PUBLIC_SKILL_DIR, 'SKILL.md')

    // Generate checkly.rules.md (configure header + all configure-* references concatenated)
    const demotedReferences = referenceContents.map(demoteHeadings).join('\n\n')
    const rulesContent = normalizeBlankLines(stripYamlFrontmatter(
      configureContent
      + '\n'
      + demotedReferences,
    ))
    await writeOutput(rulesContent, RULES_OUTPUT_DIR, 'checkly.rules.md')

    // Copy README
    const readme = await readFile(join(AI_CONTEXT_DIR, 'README.md'), 'utf8')
    await writeOutput(readme, PUBLIC_SKILL_DIR, 'README.md')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to prepare AI context:', error)
    process.exit(1)
  }
}

prepareContext()
