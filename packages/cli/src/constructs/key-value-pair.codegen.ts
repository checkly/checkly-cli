import { object, Value } from '../sourcegen'
import KeyValuePair from './key-value-pair'

export function valueForKeyValuePair (kv: KeyValuePair): Value {
  return object(builder => {
    builder.string('key', kv.key)
    builder.string('value', kv.value)

    if (kv.locked !== undefined) {
      builder.boolean('locked', kv.locked)
    }

    if (kv.secret !== undefined) {
      builder.boolean('secret', kv.secret)
    }
  })
}
