import { GeneratedFile, Value } from '../sourcegen/index.js'
import { valueForGeneralAssertion, valueForNumericAssertion } from './internal/assertion-codegen.js'
import { SslAssertion } from './ssl-assertion.js'

const generalNoArgs = { hasProperty: false, hasRegex: false }

export function valueForSslAssertion (genfile: GeneratedFile, assertion: SslAssertion): Value {
  genfile.namedImport('SslAssertionBuilder', 'checkly/constructs')

  switch (assertion.source) {
    case 'CERT_EXPIRES_IN_DAYS':
      return valueForNumericAssertion('SslAssertionBuilder', 'certExpiresInDays', assertion)
    case 'KEY_SIZE_BITS':
      return valueForNumericAssertion('SslAssertionBuilder', 'keySizeBits', assertion)
    case 'CERT_NOT_EXPIRED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'certNotExpired', assertion, generalNoArgs)
    case 'HOSTNAME_VERIFIED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'hostnameVerified', assertion, generalNoArgs)
    case 'CHAIN_TRUSTED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'chainTrusted', assertion, generalNoArgs)
    case 'OCSP_STAPLED':
      return valueForGeneralAssertion('SslAssertionBuilder', 'ocspStapled', assertion, generalNoArgs)
    case 'TLS_VERSION':
      return valueForGeneralAssertion('SslAssertionBuilder', 'tlsVersion', assertion, generalNoArgs)
    case 'CIPHER_SUITE':
      return valueForGeneralAssertion('SslAssertionBuilder', 'cipherSuite', assertion, generalNoArgs)
    case 'ISSUER_CN':
      return valueForGeneralAssertion('SslAssertionBuilder', 'issuerCn', assertion, generalNoArgs)
    case 'CERT_FINGERPRINT_SHA256':
      return valueForGeneralAssertion('SslAssertionBuilder', 'certFingerprintSha256', assertion, generalNoArgs)
    case 'ISSUER_FINGERPRINT_SHA256':
      return valueForGeneralAssertion('SslAssertionBuilder', 'issuerFingerprintSha256', assertion, generalNoArgs)
    case 'SIGNATURE_ALGORITHM':
      return valueForGeneralAssertion('SslAssertionBuilder', 'signatureAlgorithm', assertion, generalNoArgs)
    default:
      throw new Error(`Unsupported SSL assertion source ${assertion.source}`)
  }
}
