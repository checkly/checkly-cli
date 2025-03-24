import { Program } from '../sourcegen'

export abstract class Codegen<T> {
  program: Program

  constructor (program: Program) {
    this.program = program
  }

  abstract gencode (logicalId: string, resource: T): void
}
