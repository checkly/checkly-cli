import { decl, expr, GeneratedFile, ident, object, Program, Value } from '../sourcegen/index.js'
import { Context, MASKED_VALUE } from './internal/codegen/index.js'
import KeyValuePair from './key-value-pair.js'

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

    if (kv.secret !== true) {
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
      const secretVariable = ident(kv.key, {
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

      builder.value('value', secretVariable)

      builder.boolean('secret', true)
    }
  })
}
