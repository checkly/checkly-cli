import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { EXAMPLE_CONFIGS } from '../src/ai-context/context'

const EXAMPLES_DIR = join(__dirname, '../gen/')
const CONTEXT_TEMPLATE_PATH = join(
  __dirname,
  '../src/ai-context/checkly.context.template.md',
)
const RULES_OUTPUT_DIR = join(__dirname, '../dist/ai-context')
const SKILL_OUTPUT_DIR = join(__dirname, '../dist/ai-context/skills/monitoring')
const README_PATH = join(__dirname, '../src/ai-context/README.md')

function stripYamlFrontmatter (content: string): string {
  const frontmatterRegex = /^---\r?\n[\s\S]*?\r?\n---\r?\n+/
  return content.replace(frontmatterRegex, '')
}

async function writeOutput (content: string, dir: string, filename: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  const outputPath = join(dir, filename)
  await writeFile(outputPath, content, 'utf8')
  // eslint-disable-next-line no-console
  console.log(`✅ Compiled to ${outputPath}`)
}

async function prepareContext () {
  try {
    // eslint-disable-next-line no-console
    console.log('📝 Compiling context template with examples...')

    let content = await readFile(CONTEXT_TEMPLATE_PATH, 'utf8')
    const examples = await readExampleCode()

    for (const example of examples) {
      content = content.replace(example.templateString, example.code)
    }

    await writeOutput(content, SKILL_OUTPUT_DIR, 'SKILL.md')
    await writeOutput(
      stripYamlFrontmatter(content),
      RULES_OUTPUT_DIR,
      'checkly.rules.md',
    )

    const readme = await readFile(README_PATH, 'utf8')
    await writeOutput(readme, SKILL_OUTPUT_DIR, 'README.md')
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Failed to compile context:', error)
    process.exit(1)
  }
}

async function readExampleCode (): Promise<
  { templateString: string, code: string }[]
> {
  const examples: { templateString: string, code: string }[] = []

  for (const config of Object.values(EXAMPLE_CONFIGS)) {
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
          `Warning: Could not read example for ${config.templateString} from ${filePath}. It might not exist or be accessible.`,
        )
      }
    }

    if (code) {
      const wrappedCode = `**Reference:** ${config.reference}\n\n\`\`\`typescript\n${code}\`\`\``
      examples.push({
        templateString: config.templateString,
        code: wrappedCode,
      })
    }
  }

  return examples
}

prepareContext()
