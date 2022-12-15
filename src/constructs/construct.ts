abstract class Construct {
  logicalId: string
  constructor (logicalId: string) {
    this.logicalId = logicalId
  }

  abstract synthesize(): Promise<any>|any;
}

export default Construct
