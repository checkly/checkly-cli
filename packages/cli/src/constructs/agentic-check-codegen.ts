import { Codegen, Context } from './internal/codegen'
import { expr, ident, ObjectValueBuilder } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check-codegen'

/**
 * Shape of a `selectedEnvironmentVariables` entry as stored on the backend
 * inside `agenticCheckData`. The runner accepts two forms — a bare variable
 * name, or an object with `key` and an optional `description`. The CLI
 * construct uses `name` (not `key`), so the codegen translates object-form
 * entries during emission.
 */
type StoredAgenticEnvironmentVariable =
  | string
  | { key: string, description?: string }

/**
 * Shape of `agenticCheckData` as stored on the backend and returned to the
 * CLI during `checkly import`. Only fields the construct exposes are read.
 * `assertionRules` is deliberately ignored — the agent generates those on
 * the first run and the backend's deploy logic preserves them, so the CLI
 * construct never needs to emit them.
 */
interface StoredAgenticCheckData {
  skills?: string[] | null
  selectedEnvironmentVariables?: StoredAgenticEnvironmentVariable[] | null
  // Intentionally not consumed by codegen:
  // assertionRules?: unknown[]
  [key: string]: unknown
}

export interface AgenticCheckResource extends CheckResource {
  checkType: 'AGENTIC'
  prompt: string
  agenticCheckData?: StoredAgenticCheckData | null
}

const construct = 'AgenticCheck'

export class AgenticCheckCodegen extends Codegen<AgenticCheckResource> {
  describe (resource: AgenticCheckResource): string {
    return `Agentic Check: ${resource.name}`
  }

  gencode (logicalId: string, resource: AgenticCheckResource, context: Context): void {
    const filePath = context.filePath('resources/agentic-checks', resource.name, {
      tags: resource.tags,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    // The `AgenticCheck` construct's props type intentionally omits
    // `locations`, `privateLocations`, `runParallel`, `retryStrategy`,
    // `shouldFail`, `doubleCheck`, `triggerIncident` and `groupId` — the
    // platform does not yet honor any of these for agentic checks (see the
    // construct file for the full rationale). The codegen has to match
    // that omission: if the generated file contained any of those keys,
    // it would not type-check against the construct the moment a user
    // opens it.
    //
    // Most of the omitted fields are already conditional in
    // `buildCheckProps` (they're only emitted when non-false/non-empty),
    // so we pass a resource copy with `locations` cleared — the rest
    // never get populated for agentic checks today anyway, and if they
    // ever do, the fall-through will surface as a typecheck error in the
    // generated file which is the right place to catch it.
    // `retryStrategy` is the exception: `buildCheckProps` always emits
    // it, so we explicitly opt out via `skipRetryStrategy`.
    const sanitizedResource: AgenticCheckResource = {
      ...resource,
      locations: undefined,
    }

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.string('prompt', resource.prompt)

          // Emit agentRuntime only when there's something meaningful to
          // carry. An imported check with no skills and no selected env
          // vars would otherwise produce an empty `agentRuntime: {}` block,
          // which is noise in the generated code.
          const agentRuntimeValue = buildAgentRuntimeObject(resource.agenticCheckData)
          if (agentRuntimeValue !== undefined) {
            builder.object('agentRuntime', agentRuntimeValue)
          }

          buildCheckProps(this.program, file, builder, sanitizedResource, context, {
            skipRetryStrategy: true,
          })
        })
      })
    }))
  }
}

/**
 * Build an `agentRuntime: { ... }` object literal for the codegen output,
 * reverse-translating the backend's storage shape (`selectedEnvironmentVariables`
 * with `key`) into the CLI construct's shape (`environmentVariables` with
 * `name`). Returns `undefined` when the input contains nothing worth
 * emitting, so the caller can skip the property entirely.
 */
function buildAgentRuntimeObject (
  data: StoredAgenticCheckData | null | undefined,
): ((builder: ObjectValueBuilder) => void) | undefined {
  if (!data) return undefined

  const skills = Array.isArray(data.skills) ? data.skills.filter(s => typeof s === 'string' && s.length > 0) : []
  const storedEnvVars = Array.isArray(data.selectedEnvironmentVariables)
    ? data.selectedEnvironmentVariables
    : []

  if (skills.length === 0 && storedEnvVars.length === 0) {
    return undefined
  }

  return builder => {
    if (skills.length > 0) {
      builder.array('skills', arrayBuilder => {
        for (const skill of skills) {
          arrayBuilder.string(skill)
        }
      })
    }

    if (storedEnvVars.length > 0) {
      builder.array('environmentVariables', arrayBuilder => {
        for (const entry of storedEnvVars) {
          if (typeof entry === 'string') {
            arrayBuilder.string(entry)
          } else if (entry && typeof entry === 'object' && typeof entry.key === 'string') {
            arrayBuilder.object(objectBuilder => {
              objectBuilder.string('name', entry.key)
              if (typeof entry.description === 'string' && entry.description.length > 0) {
                objectBuilder.string('description', entry.description)
              }
            })
          }
        }
      })
    }
  }
}
