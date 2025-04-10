import { decl, expr, GeneratedFile, ident, object, Program, Value } from '../sourcegen'
import { Context } from './internal/codegen'
import KeyValuePair from './key-value-pair'

export function valueForKeyValuePair (
  program: Program,
  genfile: GeneratedFile,
  context: Context,
  kv: KeyValuePair,
): Value {
  return object(builder => {
    builder.string('key', kv.key)

    if (kv.secret !== true) {
      builder.string('value', kv.value)
    }

    if (kv.locked === true) {
      builder.boolean('locked', kv.locked)
    }

    if (kv.secret === true) {
      const secretVariable = ident(kv.key, {
        format: 'SCREAMING_SNAKE_CASE',
      })

      if (context.registerKnownSecret(secretVariable.value)) {
        const secretsFile = program.generatedFile('secrets', {
          type: 'auxiliary',
        })

        secretsFile.import('secret', 'checkly/util')

        secretsFile.section(decl(secretVariable, builder => {
          builder.variable(expr(ident('secret'), builder => {
            builder.call(builder => {
              builder.string(secretVariable.value)
            })
          }))

          builder.export()
        }))
      }

      genfile.import(secretVariable.value, 'secrets', {
        relativeToSelf: true,
      })

      builder.value('value', secretVariable)

      builder.boolean('secret', true)
    }
  })
}
