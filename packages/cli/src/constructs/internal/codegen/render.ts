import { Output } from '../../../sourcegen/index.js'
import { Codegen } from './codegen.js'
import { Context } from './context.js'

/**
 * A construct could not be rendered on its own. Callers that render for a
 * reader — the diff `checkly deploy --preview` prints — treat this as "show
 * the coarser listing instead", never as a failure of the command.
 */
export class ConstructRenderError extends Error {
  constructor (message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ConstructRenderError'
  }
}

export interface RenderConstructOptions {
  /**
   * A context to generate against, normally one the caller has already
   * registered variables into so that references render as the names the
   * project gives them rather than as `fromId(...)` calls.
   *
   * Registering a variable needs a file to import it from; use
   * `Program.generatedSupportFile()` for those, so the placeholder does not
   * look like the construct file this function is looking for.
   *
   * **One context and one program per render, never shared.** A context
   * accumulates state: `Context.filePath()` hands out `my-check-2` the second
   * time it is asked for a path, and that path is rendered into browser and
   * API checks as their entrypoint, so a context reused across resources makes
   * a resource's rendered code depend on which resources preceded it. The
   * `register*` methods also overwrite silently, so a second render can
   * repoint a locator the caller set up for the first.
   */
  context?: Context
}

/**
 * Renders one construct to a string, without writing anything to disk and
 * without the file scaffolding around it: no generated-file header and no
 * import list, just the construct as it would read in a check file.
 *
 * **What a construct does not contain.** A codegen writes script and snippet
 * bodies to files of their own — a browser or multi-step check's script to a
 * spec file, an API check's setup and teardown scripts to support files — and
 * leaves only an `entrypoint` path behind in the construct. Those files are
 * not part of what this function returns, so two resources differing only in a
 * check's script render to the same string. A caller diffing two sides has to
 * treat "the renders are equal" as "nothing I can show here", not as "nothing
 * changed", and report such a change another way.
 *
 * The codegen generates into the program it was constructed with, so a caller
 * comparing two versions of a resource builds a program and a codegen per
 * side. A program is single-use either way: a render that throws part-way has
 * already registered its construct file, and a retry against the same program
 * would find that file unchanged and report it as having generated nothing.
 *
 * @param logicalId Names the construct where the codegen uses it, and labels
 * the errors raised here. `ConstructCodegen` is not one of those codegens: it
 * forwards `resource.logicalId` to the per-type codegen, so with a construct
 * envelope this argument only labels errors, and the name in the rendered code
 * comes from the envelope. Two sides that must compare equal therefore have to
 * agree on `resource.logicalId`, not just on this argument.
 *
 * @throws ConstructRenderError if the codegen produced no construct file, or
 * more than one, since neither leaves anything unambiguous to return.
 *
 * Errors from the codegens themselves are deliberately left as they are, the
 * way `commands/import/plan.ts` takes them: a resource type they do not cover
 * throws a plain `Error`, and a script they cannot
 * parse throws `UnsupportedScriptError`. **So a caller rendering for a reader
 * catches `Error`, not only `ConstructRenderError`**, and treats any of them
 * as "show the coarser listing for this resource".
 */
export function renderConstruct<T> (
  codegen: Codegen<T>,
  logicalId: string,
  resource: T,
  options: RenderConstructOptions = {},
): string {
  const { program } = codegen
  const context = options.context ?? new Context()

  // Both phases are watched, not just `gencode`: several codegens create and
  // register their construct file in `prepare` and then generate into the file
  // the registration returns.
  const existing = new Set(program.generatedConstructFiles)
  codegen.prepare(logicalId, resource, context)
  codegen.gencode(logicalId, resource, context)
  const added = program.generatedConstructFiles.filter(file => !existing.has(file))

  if (added.length !== 1) {
    throw new ConstructRenderError(
      `Rendering '${logicalId}' produced ${added.length} construct files; expected exactly one.`,
    )
  }

  const output = new Output()
  try {
    added[0].render(output, { scaffolding: false })
  } catch (cause) {
    throw new ConstructRenderError(`Failed to render '${logicalId}': ${cause}`, { cause })
  }

  // `GeneratedFile.render` separates sections with a blank line, which leaves
  // one at the top once the headers and imports above them are gone.
  return output.finalize().replace(/^\n+/, '')
}
