import {
  Assertion as CoreAssertion,
  NumericAssertionBuilder,
  GeneralAssertionBuilder,
} from './internal/assertion'

type ApiAssertionSource =
  | 'STATUS_CODE'
  | 'JSON_BODY'
  | 'HEADERS'
  | 'TEXT_BODY'
  | 'RESPONSE_TIME'

// Called Assertion instead of ApiAssertion for historical reasons.
export type Assertion = CoreAssertion<ApiAssertionSource>

// Called AssertionBuilder instead of ApiAssertionBuilder for historical
// reasons.
export class AssertionBuilder {
  static statusCode () {
    return new NumericAssertionBuilder<ApiAssertionSource>('STATUS_CODE')
  }

  static jsonBody (property?: string) {
    return new GeneralAssertionBuilder<ApiAssertionSource>('JSON_BODY', property)
  }

  static headers (property?: string, regex?: string) {
    return new GeneralAssertionBuilder<ApiAssertionSource>('HEADERS', property, regex)
  }

  static textBody (property?: string) {
    return new GeneralAssertionBuilder<ApiAssertionSource>('TEXT_BODY', property)
  }

  static responseTime () {
    return new NumericAssertionBuilder<ApiAssertionSource>('RESPONSE_TIME')
  }

  /** @deprecated Use {@link responseTime()} instead */
  static responseTme () {
    return AssertionBuilder.responseTime()
  }
}
