import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { EXAMPLE_CONFIGS, REFERENCES } from '../src/ai-context/context'

const EXAMPLES_DIR = join(__dirname, '../gen/')
const AI_CONTEXT_DIR = join(__dirname, '../src/ai-context')
const RULES_OUTPUT_DIR = join(__dirname, '../dist/ai-context')
const SKILL_OUTPUT_DIR = join(__dirname, '../dist/ai-context/skills/monitoring')
const REFERENCES_OUTPUT_DIR = join(SKILL_OUTPUT_DIR, 'references')

function stripYamlFrontmatter (content: string): string {
  const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/
  return content.replace(frontmatterRegex, '')
}

async function writeOutput (content: string, dir: string, filename: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  const outputPath = join(dir, filename)
  await writeFile(outputPath, content, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`✅ Wrote ${outputPath}`)
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

function generateReferenceLinks (): string {
  return REFERENCES.map(
    ref => `- [${ref.linkText}](references/${ref.id}.md) - ${ref.description}`,
  ).join('\n')
}

async function prepareContext () {
  try {
    // eslint-disable-next-line no-console
    console.log('📝 Preparing AI context...')

    const examples = await readExampleCode()

    // Read source files
    const header = await readFile(join(AI_CONTEXT_DIR, 'skill-header.md'), 'utf8')
    const footer = await readFile(join(AI_CONTEXT_DIR, 'skill-footer.md'), 'utf8')

    // Process reference files and collect their content
    const referenceContents: string[] = []

    for (const ref of REFERENCES) {
      const refContent = await readFile(
        join(AI_CONTEXT_DIR, 'references', `${ref.id}.md`),
        'utf8',
      )
      const processedRefContent = replaceExamples(refContent, examples)
      referenceContents.push(processedRefContent)

      // Write reference file to skill output
      await writeOutput(processedRefContent, REFERENCES_OUTPUT_DIR, `${ref.id}.md`)
    }

    // Generate SKILL.md (header with reference links + footer)
    const headerWithLinks = header.replace('<!-- REFERENCE_LINKS -->', generateReferenceLinks())
    const skillContent = replaceExamples(headerWithLinks, examples) + '\n' + footer
    await writeOutput(skillContent, SKILL_OUTPUT_DIR, 'SKILL.md')

    // Generate checkly.rules.md (header + all references concatenated + footer)
    const rulesContent = stripYamlFrontmatter(
      replaceExamples(header.replace('<!-- REFERENCE_LINKS -->', ''), examples)
      + '\n'
      + referenceContents.join('\n\n')
      + '\n\n'
      + footer,
    )
    await writeOutput(rulesContent, RULES_OUTPUT_DIR, 'checkly.rules.md')

    // Copy README
    const readme = await readFile(join(AI_CONTEXT_DIR, 'README.md'), 'utf8')
    await writeOutput(readme, SKILL_OUTPUT_DIR, 'README.md')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to prepare AI context:', error)
    process.exit(1)
  }
}

prepareContext()
