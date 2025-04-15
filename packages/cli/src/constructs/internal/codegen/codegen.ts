import { Program } from '../../../sourcegen'
import { Context } from './context'

export abstract class Codegen<T> {
  program: Program

  constructor (program: Program) {
    this.program = program
  }

  prepare (logicalId: string, resource: T, context: Context): void {
    // No-op
  }

  abstract gencode (logicalId: string, resource: T, context: Context): void
}
