import { array } from './arraybuilder.js'
import { BooleanValue } from './boolean.js'
import { NullValue } from './null.js'
import { NumberValue } from './number.js'
import { object } from './objectbuilder.js'
import { StringValue } from './string.js'
import { UndefinedValue } from './undefined.js'
import { Value } from './value.js'

export function unknown (value: any): Value {
  if (value === null) {
    return new NullValue()
  }

  if (value === undefined) {
    return new UndefinedValue()
  }

  switch (typeof value) {
    case 'string':
      return new StringValue(value)
    case 'boolean':
      return new BooleanValue(value)
    case 'number':
      return new NumberValue(value)
  }

  if (Array.isArray(value)) {
    return array(builder => {
      for (const item of value) {
        builder.value(unknown(item))
      }
    })
  }

  return object(builder => {
    for (const [key, val] of Object.entries(value)) {
      builder.value(key, unknown(val))
    }
  })
}
