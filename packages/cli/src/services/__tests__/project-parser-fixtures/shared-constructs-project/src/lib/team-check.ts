import { ApiCheck, ApiCheckProps } from 'checkly/constructs'

// A subclass; instances belong to the file that runs `new`, not to this one.
export class TeamApiCheck extends ApiCheck {
  constructor (logicalId: string, props: Omit<ApiCheckProps, 'request'> & { url: string }) {
    const { url, ...rest } = props
    super(logicalId, { ...rest, request: { method: 'GET', url } })
  }
}
