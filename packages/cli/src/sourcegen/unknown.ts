import { array } from './arraybuilder'
import { BooleanValue } from './boolean'
import { NullValue } from './null'
import { NumberValue } from './number'
import { object } from './objectbuilder'
import { StringValue } from './string'
import { UndefinedValue } from './undefined'
import { Value } from './value'

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
