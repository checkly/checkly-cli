import { Program } from '../../../sourcegen'
import { Context } from './context'

export abstract class Codegen<T> {
  program: Program

  constructor (program: Program) {
    this.program = program
  }

  prepare (
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    logicalId: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    resource: T,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    context: Context,
  ): void {
    // No-op
  }

  abstract describe (resource: T): string

  abstract gencode (logicalId: string, resource: T, context: Context): void
}
