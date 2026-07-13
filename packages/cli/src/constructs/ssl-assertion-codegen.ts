import { GeneratedFile, Value } from '../sourcegen/index.js'
import {
  unsupportedAssertionSource,
  valueForBooleanAssertion,
  valueForGeneralAssertion,
  valueForNumericAssertion,
} from './internal/assertion-codegen.js'
import { SslAssertion } from './ssl-assertion.js'

const generalNoArgs = { hasProperty: false, hasRegex: false }
// The string sources additionally accept the MATCHES (regex) operator.
const generalWithMatches = { hasProperty: false, hasRegex: false, hasMatches: true }

export function valueForSslAssertion (genfile: GeneratedFile, assertion: SslAssertion): Value {
  genfile.namedImport('SslAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'CERT_EXPIRES_IN_DAYS':
      return valueForNumericAssertion('SslAssertionBuilder', 'certExpiresInDays', assertion)
    case 'KEY_SIZE_BITS':
      return valueForNumericAssertion('SslAssertionBuilder', 'keySizeBits', assertion)
    case 'CERT_NOT_EXPIRED':
      return valueForBooleanAssertion('SslAssertionBuilder', 'certNotExpired', assertion)
    case 'HOSTNAME_VERIFIED':
      return valueForBooleanAssertion('SslAssertionBuilder', 'hostnameVerified', assertion)
    case 'CHAIN_TRUSTED':
      return valueForBooleanAssertion('SslAssertionBuilder', 'chainTrusted', assertion)
    case 'OCSP_STAPLED':
      return valueForBooleanAssertion('SslAssertionBuilder', 'ocspStapled', assertion)
    case 'TLS_VERSION':
      return valueForGeneralAssertion('SslAssertionBuilder', 'tlsVersion', assertion, generalNoArgs)
    case 'CIPHER_SUITE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'cipherSuite', assertion, generalWithMatches)
    case 'ISSUER_CN':
      return valueForGeneralAssertion('SslAssertionBuilder', 'issuerCn', assertion, generalWithMatches)
    case 'CERT_FINGERPRINT_SHA256':
      return valueForGeneralAssertion('SslAssertionBuilder', 'certFingerprintSha256', assertion, generalNoArgs)
    case 'ISSUER_FINGERPRINT_SHA256':
      return valueForGeneralAssertion('SslAssertionBuilder', 'issuerFingerprintSha256', assertion, generalNoArgs)
    case 'SIGNATURE_ALGORITHM':
      return valueForGeneralAssertion('SslAssertionBuilder', 'signatureAlgorithm', assertion, generalWithMatches)
    default:
      return unsupportedAssertionSource(assertion.source, 'SSL')
  }
}
