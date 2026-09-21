import { Codegen, Context } from './internal/codegen/index.js'
import { expr, GeneratedFile, ident, unknown, Value } from '../sourcegen/index.js'
import { buildRuntimeCheckProps, RuntimeCheckResource } from './check-codegen.js'
import { PlaywrightCheck } from './playwright-check.js'

/**
 * Generates a `PlaywrightCheck` construct from a Playwright check suite's
 * API representation.
 *
 * The deploy preview is this codegen's consumer: it renders the deployed and
 * the local version of an updated suite as constructs and prints the
 * difference. `checkly import` never writes a suite: the API leaves them out
 * of import plans, because a suite is defined by its uploaded code bundle,
 * which an import plan cannot hand back as source, and the import command
 * refuses one on its own too (`PREVIEW_ONLY_CHECK_TYPES` in
 * `check-codegen.ts`). The code generated here is displayed, not written to
 * a project.
 *
 * What the API holds differs from what the construct takes. The construct's
 * `playwrightConfigPath`, `pwProjects` and `pwTags` are not stored: the CLI
 * folds them into `testCommand` on deploy (`PlaywrightCheck.buildTestCommand`
 * appends `--config <path>`, `--project <name>…` and `--grep <tag>|<tag>` to
 * the user's command, or to the package manager's `playwright test`). This
 * codegen unfolds that command again, so the construct reads as the user
 * wrote it, and prints `testCommand` only when the user's part differs from
 * the package manager's default (the project's current one: a suite deployed
 * under another package manager shows its old default as a `testCommand`
 * the new deploy removes). A command that is not in the CLI's own
 * format is printed whole and `playwrightConfigPath` is left out: the
 * construct requires the prop, but a made-up path would show a change that
 * did not happen. Such a construct would not type-check; the preview only
 * displays it.
 *
 * Deliberately not printed: the code bundle (`codeBundlePath`,
 * `codeBundleSha256`), the dependency cache hash, the Playwright version, the
 * browsers and the working directory. They describe the bundled project
 * rather than the construct's props; the API reports the bundle, the version
 * and the cache as changes with a cause, which the preview prints as notes
 * beside the construct. A `browsers` or `workingDir` change has no cause and
 * is not listed beside a construct diff; both derive from the bundled
 * Playwright project, whose change the code bundle note announces.
 *
 * A suite has no retry strategy and no double check (Playwright retries
 * tests itself), and no automatic check repair, so none of those is printed
 * whatever the API sends.
 */

export interface PlaywrightCheckResource extends RuntimeCheckResource {
  checkType: 'PLAYWRIGHT'
  /** The full command the runner executes; see {@link unfoldTestCommand}. */
  testCommand?: string | null
  installCommand?: string | null
  /** The JavaScript engine's name (`node`, `bun`) and version. */
  engine?: string | null
  engineVersion?: string | null
}

/** A test command split into the construct props it was built from. */
export interface UnfoldedTestCommand {
  /**
   * The command without the flags the CLI appends; the whole command when it
   * could not be unfolded.
   */
  command: string
  playwrightConfigPath?: string
  pwProjects?: string[]
  pwTags?: string[]
}

interface Word {
  text: string
  start: number
  /** Whether any part of the word was quoted or escaped; a flag never is. */
  quoted: boolean
}

/** The characters a backslash escapes inside double quotes in a POSIX shell. */
const DOUBLE_QUOTE_ESCAPABLE = new Set(['$', '`', '"', '\\'])

/**
 * Splits a command into words the way a POSIX shell would: whitespace
 * separates, single quotes take everything literally, double quotes let a
 * backslash escape the few characters the shell would expand, a backslash
 * outside quotes escapes the next character, and a backslash before a
 * newline continues the line. This covers what
 * `shellQuote` produces (bare words and single-quoted words with `'"'"'` for
 * an embedded quote) and the usual hand-written forms. An unterminated quote
 * makes the command unreadable.
 */
function shellWords (command: string): Word[] | undefined {
  const words: Word[] = []
  let current: Word | undefined
  let quote: '\'' | '"' | undefined
  for (let index = 0; index < command.length; index++) {
    const char = command[index]
    if (quote === undefined) {
      if (char === ' ' || char === '\t' || char === '\n') {
        if (current !== undefined) {
          words.push(current)
          current = undefined
        }
        continue
      }
      if (char === '\\' && command[index + 1] === '\n') {
        index++
        continue
      }
      current ??= { text: '', start: index, quoted: false }
      if (char === '\'' || char === '"') {
        quote = char
        current.quoted = true
      } else if (char === '\\' && index + 1 < command.length) {
        current.text += command[++index]
        current.quoted = true
      } else {
        current.text += char
      }
      continue
    }
    if (char === quote) {
      quote = undefined
    } else if (quote === '"' && char === '\\' && command[index + 1] === '\n') {
      index++
    } else if (quote === '"' && char === '\\' && DOUBLE_QUOTE_ESCAPABLE.has(command[index + 1] ?? '')) {
      current!.text += command[++index]
    } else {
      current!.text += char
    }
  }
  if (quote !== undefined) {
    return undefined
  }
  if (current !== undefined) {
    words.push(current)
  }
  return words
}

const isFlag = (word: Word): boolean => !word.quoted && word.text.startsWith('--')

/**
 * Reads the part the CLI appended, starting at the word after `--config`:
 * the config path, then `--project <name>…` and `--grep <tag>|<tag>`, each at
 * most once. A value never looks like a flag: `shellQuote` leaves a bare
 * `--foo` project name as it is, and reading such a tail could put the
 * user's own trailing flag together with the CLI's config path, so the
 * command is left whole instead. Anything else means the CLI did not build
 * this tail.
 */
function readAppendedFlags (words: Word[]): Omit<UnfoldedTestCommand, 'command'> | undefined {
  const [config, ...rest] = words
  if (config === undefined) {
    return undefined
  }
  let pwProjects: string[] | undefined
  let pwTags: string[] | undefined
  for (let index = 0; index < rest.length;) {
    const flag = rest[index++].text
    const values: string[] = []
    while (index < rest.length && !isFlag(rest[index])) {
      values.push(rest[index++].text)
    }
    if (flag === '--project' && pwProjects === undefined && values.length > 0) {
      pwProjects = values
    } else if (flag === '--grep' && pwTags === undefined && values.length === 1) {
      pwTags = values[0].split('|')
    } else {
      return undefined
    }
  }
  return { playwrightConfigPath: config.text, pwProjects, pwTags }
}

/**
 * Splits a stored test command back into the user's command and the
 * construct props the CLI folded into it. A bare `--config` word marks where
 * the CLI's part may start; the earliest one whose tail reads as the CLI's
 * format wins, so a user's own command keeps whatever it had before it
 * (spacing and quoting included) and a quoted value that merely spells a
 * flag is never mistaken for the boundary. A command with no such boundary
 * was not built by the CLI and is returned whole.
 *
 * The `--grep` pattern joins the tags with `|`, so a single tag that itself
 * contains `|` cannot be told from two tags and comes back as two.
 */
export function unfoldTestCommand (testCommand: string): UnfoldedTestCommand {
  const words = shellWords(testCommand) ?? []
  for (let index = 1; index < words.length; index++) {
    if (!isFlag(words[index]) || words[index].text !== '--config') {
      continue
    }
    const appended = readAppendedFlags(words.slice(index + 1))
    if (appended !== undefined) {
      // Whitespace and a line continuation before the boundary belong to
      // neither side.
      const command = testCommand.slice(0, words[index].start).replace(/(\s|\\\n)+$/, '')
      return { command, ...appended }
    }
  }
  return { command: testCommand }
}

const construct = 'PlaywrightCheck'

export class PlaywrightCheckCodegen extends Codegen<PlaywrightCheckResource> {
  describe (resource: PlaywrightCheckResource): string {
    return `Playwright Check Suite: ${resource.name}`
  }

  gencode (logicalId: string, resource: PlaywrightCheckResource, context: Context): void {
    const filePath = context.filePath('resources/playwright-check-suites', resource.name, {
      tags: resource.tags,
      isolate: true,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          const { command, playwrightConfigPath, pwProjects, pwTags }: Partial<UnfoldedTestCommand> =
            resource.testCommand != null ? unfoldTestCommand(resource.testCommand) : {}

          if (playwrightConfigPath !== undefined) {
            builder.string('playwrightConfigPath', playwrightConfigPath)
          }

          if (pwProjects !== undefined) {
            builder.array('pwProjects', builder => {
              for (const project of pwProjects) {
                builder.string(project)
              }
            })
          }

          if (pwTags !== undefined) {
            builder.array('pwTags', builder => {
              for (const tag of pwTags) {
                builder.string(tag)
              }
            })
          }

          // The construct fills in the package manager's `playwright test`
          // when no command is given, so that command is not spelled out.
          if (command !== undefined && command !== PlaywrightCheck.defaultTestCommand()) {
            builder.string('testCommand', command)
          }

          if (resource.installCommand != null) {
            builder.string('installCommand', resource.installCommand)
          }

          // An engine without a version cannot be spelled as the construct's
          // `Engine` (which always carries one) and is left out.
          if (resource.engine != null && resource.engineVersion != null) {
            builder.value('engine', valueForEngine(file, resource.engine, resource.engineVersion))
          }

          buildRuntimeCheckProps(this.program, file, builder, resource, context, {
            omit: ['retryStrategy'],
          })
        })
      })
    }))
  }
}

/**
 * `Engine.node(version)` or `Engine.bun(version)` for the engines the
 * construct offers; any other name as a plain object of the same shape,
 * which the prop's type accepts, so an unfamiliar engine still shows.
 */
function valueForEngine (file: GeneratedFile, name: string, version: string): Value {
  if (name === 'node' || name === 'bun') {
    file.namedImport('Engine', 'checkly/constructs')
    return expr(ident('Engine'), builder => {
      builder.member(ident(name))
      builder.call(builder => {
        builder.string(version)
      })
    })
  }
  return unknown({ name, version })
}
