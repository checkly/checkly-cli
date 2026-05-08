import { Output } from './output.js'

export abstract class Value {
  abstract render (output: Output): void
}
