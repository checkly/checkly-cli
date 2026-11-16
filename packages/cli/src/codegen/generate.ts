import path from 'node:path'

import { docComment, Program } from '../sourcegen/index.js'
import { ProgramFile, StaticAuxiliaryFile } from '../sourcegen/program.js'
import { ConstructCodegen, sortResources } from '../constructs/construct-codegen.js'
import { PREVIEW_ONLY_CHECK_TYPES } from '../constructs/check-codegen.js'
import { Context, type ProjectDefaults, type ReferencedNames } from '../constructs/internal/codegen/index.js'
import { isSnippet, isSafeSnippetFilename } from '../constructs/internal/codegen/snippet.js'
import type { ConstructExport } from '../constructs/session.js'
import type { AuxiliaryResourceSync, FriendResourceSync } from '../rest/projects.js'

/** A resource to generate a construct for, as an import plan carries it. */
export interface GenerateResource {
  type: string
  logicalId: string
  physicalId?: string | number
  payload: any
}

/**
 * The resources to generate code for, in the shape of an import plan's
 * `changes`: the resources themselves and the account data they refer to
 * (`auxiliary`, such as the snippets a check's scripts use).
 */
export interface GenerateChanges<R extends GenerateResource = GenerateResource> {
  resources: R[]
  auxiliary?: AuxiliaryResourceSync[]
}

/**
 * The changes of an import plan, which also lists the resources the project
 * already declares (`friends`), for the generated code to import from the
 * project's own files.
 */
export interface ImportChanges<R extends GenerateResource = GenerateResource> extends GenerateChanges<R> {
  friends?: FriendResourceSync[]
}

export interface GenerateOptions {
  /**
   * The check defaults of the project the code is generated for. Absent, the
   * project is unknown and every check property a project default could
   * change is written out, even at its default value (see
   * `ContextOptions.projectDefaults`). Pass `{}` for a project without
   * defaults.
   */
  projectDefaults?: ProjectDefaults
  /**
   * Names of the resources the generated code refers to by ID, keyed by
   * resource type and physical ID. Each such `fromId()` reference carries the
   * name in a trailing comment.
   */
  referencedNames?: ReferencedNames
}

/** A resource the codegen could not generate, and why. */
export interface GenerateFailure<R extends GenerateResource = GenerateResource> {
  resource: R
  cause: Error
}

export interface GeneratedConstructFile {
  /** Relative to the root of the generated code, with `/` separators. */
  path: string
  content: string
}

export interface GenerateResult {
  files: GeneratedConstructFile[]
  failures: GenerateFailure[]
}

export interface GenerateIntoProgramOptions extends GenerateOptions {
  /**
   * The construct the project exports for a friend resource, looked up by
   * the friend's type and logical ID. Without it, every friend is reported
   * as not requested.
   */
  friendExport?: (type: FriendResourceSync['type'], logicalId: string) => ConstructExport | undefined
  /**
   * The context to generate against, for a caller that reads it afterwards.
   * Without it, one is created from `projectDefaults` and `referencedNames`,
   * which are then the only options it takes.
   */
  context?: Context
}

type FriendType = FriendResourceSync['type']

type FriendRegistration<T extends FriendType> = (
  context: Context,
  friend: Extract<FriendResourceSync, { type: T }>,
  constructExport: ConstructExport,
) => void

// How each type of friend resource is made known to the codegens; a type
// missing here is not supported.
const registerFriend: { [T in FriendType]: FriendRegistration<T> } = {
  'alert-channel': (context, friend, constructExport) =>
    context.registerFriendAlertChannel(friend.physicalId, constructExport),
  'check-group': (context, friend, constructExport) =>
    context.registerFriendCheckGroup(friend.physicalId, constructExport),
  'private-location': (context, friend, constructExport) =>
    context.registerFriendPrivateLocation(friend.physicalId, constructExport),
  'status-page-service': (context, friend, constructExport) =>
    context.registerFriendStatusPageService(friend.physicalId, constructExport),
  'status-page': (context, friend, constructExport) =>
    context.registerFriendStatusPage(friend.physicalId, constructExport),
  'status-page-component': (context, friend, constructExport) =>
    context.registerFriendStatusPageComponent(friend.physicalId, constructExport),
}

/**
 * Generates the constructs for `changes` into `program`, which the caller
 * then writes or renders. A resource that fails to generate is returned as a
 * failure, and the files of the other resources are still generated; a
 * friend or auxiliary resource that cannot be processed throws instead,
 * since every resource could depend on it.
 *
 * The program must be new: generated files accumulate in it.
 */
export function generateIntoProgram<R extends GenerateResource> (
  changes: ImportChanges<R>,
  program: Program,
  codegen: ConstructCodegen,
  options: GenerateIntoProgramOptions = {},
): GenerateFailure<R>[] {
  const context = options.context ?? new Context({
    projectDefaults: options.projectDefaults,
    referencedNames: options.referencedNames,
  })

  const failures = new Map<string, GenerateFailure<R>>()

  const { friends, auxiliary } = changes

  if (friends) {
    for (const resource of friends) {
      try {
        const register = Object.hasOwn(registerFriend, resource.type)
          ? registerFriend[resource.type] as FriendRegistration<FriendType>
          : undefined
        if (register === undefined) {
          throw new Error(`Unable to process unsupported friend resource type '${resource.type}'.`)
        }

        const friendExport = options.friendExport?.(resource.type, resource.logicalId)
        if (friendExport === undefined) {
          throw new Error(`Received friend resource '${resource.logicalId}' that was not requested for.`)
        }

        register(context, resource, friendExport)
      } catch (cause) {
        throw new Error(`Failed to process friend resource '${resource.type}:${resource.physicalId}' (${resource.logicalId}): ${cause}`, { cause })
      }
    }
  }

  if (auxiliary) {
    const globalSnippetFiles = new Set<StaticAuxiliaryFile>()

    for (const resource of auxiliary) {
      try {
        switch (resource.type) {
          case 'snippet': {
            const snippet = resource.payload

            if (!isSnippet(snippet)) {
              throw new Error(`Invalid auxiliary snippet`)
            }

            const snippetFilePath = context.filePath('snippets', snippet.name, {
              unique: false,
              contentKey: `snippet::${snippet.id}`,
              case: isSafeSnippetFilename(snippet.name) ? 'identity' : 'kebab-case',
            })

            const snippetFile = program.staticSupportFile(
              snippetFilePath.fullPath,
              snippet.script,
            )

            globalSnippetFiles.add(snippetFile)

            context.registerAuxiliarySnippetFile(snippet.id, snippetFile)

            break
          }
          default:
            throw new Error(`Unable to process unsupported auxiliary resource type '${resource.type}'.`)
        }
      } catch (cause) {
        throw new Error(`Failed to process auxiliary resource '${resource.type}:${resource.physicalId}': ${cause}`, { cause })
      }
    }

    // Due to questionable historical design choices, snippets may
    // reference other snippets in two ways:
    //
    // 1. From the same folder (i.e. `require('./other-snippet')`) if
    //    the requiring snippet is NOT the main entrypoint, but has
    //    itself been required by another snippet or script.
    // 2. From the magic './snippets' folder using
    //    `require('./snippets/other-snippet')` irrespective of whether
    //    the requiring snippet is the main entrypoint or not (works in
    //    either case).
    //
    // To emulate this functionality with a proper file structure, we
    // need to check if any global snippets are using the second method,
    // and create appropriate aliases in the beatifully named
    // './snippets/snippets/' folder so that the paths can resolve
    // without modification.
    for (const globalSnippetFile of globalSnippetFiles) {
      const content = globalSnippetFile.content.toString()
      // Not a use by the generated code: only what a construct's scripts use
      // counts as one (`Context.usedAuxiliarySnippetFiles`).
      const snippetFiles = context.snippetFilesRequiredBy(content)
      for (const snippetFile of snippetFiles) {
        const localSnippetFile = program.generatedSupportFile(`snippets/snippets/${snippetFile.basename}`)
        localSnippetFile.header(docComment(
          `This file has been generated to help resolve cross-snippet imports.\n`
          + `\n`
          + `We recommend rewriting your imports to not reference this file, after which\n`
          + `you may remove it.`,
        ))
        localSnippetFile.plainImport(localSnippetFile.relativePath(snippetFile))
      }
    }
  }

  // Sorted so that a resource is prepared after the resources it refers to.
  // A copy, so the caller's list keeps its order.
  const resources = sortResources([...changes.resources] as any[]) as R[]

  for (const resource of resources) {
    try {
      codegen.prepare(resource.logicalId, resource as any, context)
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw cause
      }

      failures.set(resource.logicalId, {
        resource,
        cause,
      })
    }
  }

  for (const resource of resources) {
    if (failures.has(resource.logicalId)) {
      continue
    }

    try {
      // A codegen that exists for the deploy preview only must not
      // write a construct here: a suite that reaches a plan (an API
      // without the rule that leaves them out) is reported as not
      // importable instead.
      const previewOnly = resource.type === 'check'
        ? PREVIEW_ONLY_CHECK_TYPES.get(resource.payload?.checkType)
        : undefined
      if (previewOnly !== undefined) {
        throw new Error(previewOnly)
      }
      codegen.gencode(resource.logicalId, resource as any, context)
    } catch (cause) {
      if (!(cause instanceof Error)) {
        throw cause
      }

      failures.set(resource.logicalId, {
        resource,
        cause,
      })
    }
  }

  return [...failures.values()]
}

/**
 * The paths of the snippet files, and of their `snippets/snippets/` aliases,
 * that nothing generated needs: neither a construct's scripts, nor a snippet
 * those reach by requiring it, directly or through further snippets.
 */
function unusedSnippetPaths (context: Context): Set<string> {
  const reached = new Set<ProgramFile>()
  // Snippets required through `./snippets/`, which resolve through an alias.
  const aliased = new Set<ProgramFile>()
  const queue = [...context.usedAuxiliarySnippetFiles]

  for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
    if (reached.has(file)) {
      continue
    }
    reached.add(file)
    if (!(file instanceof StaticAuxiliaryFile)) {
      continue
    }
    const content = file.content.toString()
    for (const required of context.snippetFilesRequiredBy(content)) {
      aliased.add(required)
    }
    queue.push(...context.snippetFilesRequiredBy(content, { sameFolder: true }))
  }

  const unused = new Set<string>()
  for (const file of context.auxiliarySnippetFiles) {
    if (!reached.has(file)) {
      unused.add(path.normalize(file.path))
    }
    if (!aliased.has(file)) {
      unused.add(path.join('snippets', 'snippets', file.basename))
    }
  }
  return unused
}

/**
 * Generates `checkly/constructs` code for `changes` in memory: TypeScript
 * construct files (`*.check.ts`), the spec files of browser and multi-step
 * checks (`*.spec.ts`), and their support files (scripts, snippets). Nothing
 * is read from or written to disk, and the result depends on the arguments
 * alone.
 *
 * A resource that cannot be generated is listed in `failures` with the
 * reason, and the files of the other resources are still returned, without
 * anything the failed resource would have contributed. The
 * reason is an `UnsupportedResourceTypeError` for a resource type no codegen
 * covers, an `ImportSafetyViolation` or `UnsupportedScriptError` for a
 * resource whose content cannot be converted, or a plain `Error` otherwise
 * (a Playwright check suite, whose code bundle cannot be unpacked as
 * source, among them). An error raised while a construct expression is
 * being built reaches `failures` wrapped in a plain `Error` that adds where
 * it happened, so look for these classes along the `cause` chain.
 *
 * `auxiliary` may hold every snippet of the account: only the snippets the
 * generated code uses are returned, with those they require in turn.
 *
 * Friends (resources an import plan says the project already declares) are
 * not accepted, since there is no project to import them from: a `friends`
 * field is ignored, and a reference to any resource outside `changes`
 * renders as `fromId()`, with its name from `referencedNames` when given.
 *
 * @experimental See the `checkly/codegen` entry: intended for Checkly's own
 * services, and not covered by semver guarantees until stated otherwise.
 *
 * @throws Error if an auxiliary resource cannot be processed.
 */
export function generateConstructFiles (
  changes: GenerateChanges,
  options: GenerateOptions = {},
): GenerateResult {
  // Only the fields the entry documents are passed on, whatever a caller
  // from plain JavaScript hands in.
  const { projectDefaults, referencedNames } = options
  const failures: GenerateFailure[] = []
  let resources = changes.resources

  // A resource that fails part-way may already have added a file, or an
  // import to a file, so after a failure the remaining resources are
  // generated again into a new program, as `checkly import` does when it
  // retries without the failed ones. A resource that only fails once another
  // is gone is caught by the next round; each round removes at least one.
  for (;;) {
    const program = new Program({
      rootDirectory: '.',
      constructFileSuffix: '.check',
      specFileSuffix: '.spec',
      language: 'typescript',
    })
    const codegen = new ConstructCodegen(program)
    const context = new Context({ projectDefaults, referencedNames })

    const round = generateIntoProgram(
      { resources, auxiliary: changes.auxiliary },
      program,
      codegen,
      { context },
    )

    if (round.length === 0) {
      const unused = unusedSnippetPaths(context)
      const files = program.render().filter(file => !unused.has(path.normalize(file.path))).map(file => ({
        path: file.path.replace(/\\/g, '/'),
        content: file.content.toString(),
      }))
      return { files, failures }
    }

    failures.push(...round)
    const failed = new Set(round.map(failure => failure.resource))
    resources = resources.filter(resource => !failed.has(resource))
  }
}
