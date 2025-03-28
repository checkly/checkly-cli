import { object, Value } from '../sourcegen'
import KeyValuePair from './key-value-pair'

export function valueForKeyValuePair (kv: KeyValuePair): Value {
  return object(builder => {
    builder.string('key', kv.key)
    builder.string('value', kv.value)

    if (kv.locked === true) {
      builder.boolean('locked', kv.locked)
    }

    if (kv.secret === true) {
      builder.boolean('secret', kv.secret)
    }
  })
}
