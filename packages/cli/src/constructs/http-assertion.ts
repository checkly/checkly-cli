import {
  Assertion as CoreAssertion,
  NumericAssertionBuilder,
  GeneralAssertionBuilder,
} from './internal/assertion'

type HttpAssertionSource =
  | 'STATUS_CODE'
  | 'JSON_BODY'
  | 'HEADERS'
  | 'TEXT_BODY'
  | 'RESPONSE_TIME'

export type HttpAssertion = CoreAssertion<HttpAssertionSource>

export class HttpAssertionBuilder {
  static statusCode () {
    return new NumericAssertionBuilder<HttpAssertionSource>('STATUS_CODE')
  }

  static jsonBody (property?: string) {
    return new GeneralAssertionBuilder<HttpAssertionSource>('JSON_BODY', property)
  }

  static headers (property?: string, regex?: string) {
    return new GeneralAssertionBuilder<HttpAssertionSource>('HEADERS', property, regex)
  }

  static textBody (property?: string) {
    return new GeneralAssertionBuilder<HttpAssertionSource>('TEXT_BODY', property)
  }

  static responseTime () {
    return new NumericAssertionBuilder<HttpAssertionSource>('RESPONSE_TIME')
  }
}
