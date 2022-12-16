import Check, { CheckProps } from './check'

export interface Assertion {
    source: string,
    property: string,
    comparison: string,
    target: string
    regex: string
}

export interface Request {
    url: string,
    method: string,
    followRedirects: boolean,
    skipSsl: boolean,
    assertions: Array<Assertion>
}

export interface ApiCheckProps extends CheckProps {
  request: Request
}

class ApiCheck extends Check {
  request: Request

  constructor (logicalId: string, props: ApiCheckProps) {
    super(logicalId, props)
    this.request = props.request
    this.register(Check.__checklyType, this.logicalId, this.synthesize())
    this.addSubscriptions()
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'API',
      request: this.request,
    }
  }
}

export default ApiCheck
