import {
  Assertion as CoreAssertion,
  NumericAssertionBuilder,
} from './internal/assertion'

type UrlAssertionSource =
  | 'STATUS_CODE'

export type UrlAssertion = CoreAssertion<UrlAssertionSource>

export class UrlAssertionBuilder {
  static statusCode () {
    return new NumericAssertionBuilder<UrlAssertionSource>('STATUS_CODE')
  }
}
