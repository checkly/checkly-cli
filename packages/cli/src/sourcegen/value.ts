import { Output } from './output'

export abstract class Value {
  abstract render(output: Output): void
}
