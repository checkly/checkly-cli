export class Ref {
  ref: string
  private constructor (ref: string) {
    this.ref = ref
  }

  static from (ref: string) {
    return new Ref(ref)
  }
}
