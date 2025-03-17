import { object, Value } from '../sourcegen'

export default interface KeyValuePair {
  key: string
  value: string
  locked?: boolean
  secret?: boolean
}

export function sourceForKeyValuePair (kv: KeyValuePair): Value {
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
