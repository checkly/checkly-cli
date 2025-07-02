import { IPFamily } from './ip'
import { UrlAssertion } from './url-assertion'

export interface UrlRequest {
  url: string
  ipFamily?: IPFamily
  followRedirects?: boolean
  skipSSL?: boolean
  assertions?: UrlAssertion[]
}
