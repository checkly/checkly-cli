import { decl, expr, GeneratedFile, ident, IdentifierValue, object, Program, Value } from '../sourcegen/index.js'
import { Context, MASKED_VALUE } from './internal/codegen/index.js'
import KeyValuePair from './key-value-pair.js'

/**
 * A `secret('KEY')` declared once in the shared `secrets` file, imported into
 * `genfile`. Every pair with the same key shares the one declaration.
 */
function secretReference (program: Program, genfile: GeneratedFile, context: Context, key: string): IdentifierValue {
  const secretVariable = ident(key, {
    format: 'SCREAMING_SNAKE_CASE',
  })

  if (context.registerKnownSecret(secretVariable.value)) {
    const secretsFile = program.generatedSupportFile('secrets')

    secretsFile.namedImport('secret', 'checkly/util')

    secretsFile.section(decl(secretVariable, builder => {
      builder.variable(expr(ident('secret'), builder => {
        builder.call(builder => {
          builder.string(secretVariable.value)
        })
      }))

      builder.export()
    }))
  }

  genfile.namedImport(secretVariable.value, 'secrets', {
    relativeToSelf: true,
  })

  return secretVariable
}

/**
 * @param path The dotted path of the list the pair belongs to
 * (`environmentVariables`, `request.headers`), under which the code being
 * rendered may spell out this pair's flags as `<path>[<key>].locked`.
 */
export function valueForKeyValuePair (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  kv: KeyValuePair,
  path: string,
): Value {
  const spelledOut = (flag: 'locked' | 'secret') => context.spelledOut(`${path}[${kv.key}].${flag}`)
  return object(builder => {
    builder.string('key', kv.key)

    if (kv.secret !== true && kv.locked === true && kv.value == null && context.maskedValues === undefined) {
      // A locked value the reader may not see comes back as null. It is read
      // from the environment at deploy time, the way a secret is, so a
      // deploy does not overwrite the stored value with a blank; the pair
      // stays locked and does not become a secret. A deploy preview
      // (`context.maskedValues`) is not given this rendering: there the null
      // still fails the render, and the preview lists the change without a
      // construct diff, as it does for any construct it cannot render.
      builder.value('value', secretReference(program, genfile, context, kv.key))
    } else if (kv.secret !== true) {
      builder.string('value', kv.value)
    } else if (context.maskedValues !== undefined) {
      // A preview prints a secret only as a value it masked itself; anything
      // else, whatever it looks like, prints as the plain mask.
      const value: unknown = kv.value
      builder.string('value', context.isMasked(value) ? value as string : MASKED_VALUE)
    }

    // Both flags default to false; a flag the code spells out is kept
    // whatever its value. A pair without a value for it writes nothing.
    if (kv.locked === true || (kv.locked === false && spelledOut('locked'))) {
      builder.boolean('locked', kv.locked)
    }

    if (kv.secret === true && context.maskedValues !== undefined) {
      builder.boolean('secret', true)
    } else if (kv.secret === false && spelledOut('secret')) {
      builder.boolean('secret', false)
    } else if (kv.secret === true) {
      const secretVariable = secretReference(program, genfile, context, kv.key)

      builder.value('value', secretVariable)

      builder.boolean('secret', true)
    }
  })
}
