import fs from 'node:fs/promises'

import { Check, CheckProps } from './check'
import { HttpHeader } from './http-header'
import { Session, SharedFileRef } from './project'
import { QueryParam } from './query-param'
import { Content, Entrypoint, isContent, isEntrypoint } from './construct'
import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder } from './internal/assertion'
import { Diagnostics } from './diagnostics'
import { DeprecatedPropertyDiagnostic, InvalidPropertyValueDiagnostic } from './construct-diagnostics'
import { ApiCheckBundle, ApiCheckBundleProps } from './api-check-bundle'

/** Sources that can be used for API check assertions */
type AssertionSource =
  | 'STATUS_CODE'
  | 'JSON_BODY'
  | 'HEADERS'
  | 'TEXT_BODY'
  | 'RESPONSE_TIME'

/**
 * Assertion configuration for API checks.
 * Allows validation of different aspects of HTTP responses.
 */
export type Assertion = CoreAssertion<AssertionSource>

/**
 * Builder class for creating API check assertions.
 * Provides convenient methods to create assertions for different parts of HTTP responses.
 * 
 * @example
 * ```typescript
 * // Status code assertions
 * AssertionBuilder.statusCode().equals(200)
 * AssertionBuilder.statusCode().greaterThan(199)
 * AssertionBuilder.statusCode().lessThan(300)
 * 
 * // JSON body assertions using JSONPath
 * AssertionBuilder.jsonBody('$.user.name').equals('John')
 * AssertionBuilder.jsonBody('$.users.length').equals(5)
 * AssertionBuilder.jsonBody('$.data[0].id').isNotNull()
 * 
 * // Header assertions
 * AssertionBuilder.headers('content-type').contains('application/json')
 * AssertionBuilder.headers('x-rate-limit-remaining').greaterThan(0)
 * 
 * // Text body assertions
 * AssertionBuilder.textBody().contains('Welcome to our API')
 * AssertionBuilder.textBody().notContains('error')
 * 
 * // Response time assertions
 * AssertionBuilder.responseTime().lessThan(1000)
 * AssertionBuilder.responseTime().greaterThan(100)
 * ```
 * 
 * @see {@link https://jsonpath.com/ | JSONPath Online Evaluator}
 * @see {@link https://www.checklyhq.com/docs/monitoring/api-checks/assertions/ | API Check Assertions}
 */
export class AssertionBuilder {
  /**
   * Creates an assertion builder for HTTP status codes.
   * @returns A numeric assertion builder for status codes
   */
  static statusCode () {
    return new NumericAssertionBuilder<AssertionSource>('STATUS_CODE')
  }

  /**
   * Creates an assertion builder for JSON response body.
   * @param property Optional JSON path to specific property (e.g., 'user.name')
   * @returns A general assertion builder for JSON body content
   */
  static jsonBody (property?: string) {
    return new GeneralAssertionBuilder<AssertionSource>('JSON_BODY', property)
  }

  /**
   * Creates an assertion builder for HTTP headers.
   * @param property Optional header name to target specific header
   * @param regex Optional regex pattern for header matching
   * @returns A general assertion builder for headers
   */
  static headers (property?: string, regex?: string) {
    return new GeneralAssertionBuilder<AssertionSource>('HEADERS', property, regex)
  }

  /**
   * Creates an assertion builder for text response body.
   * @param property Optional property path for text content
   * @returns A general assertion builder for text body content
   */
  static textBody (property?: string) {
    return new GeneralAssertionBuilder<AssertionSource>('TEXT_BODY', property)
  }

  /** @deprecated Use responseTime() instead */
  static responseTme () {
    return new NumericAssertionBuilder<AssertionSource>('RESPONSE_TIME')
  }

  /**
   * Creates an assertion builder for response time.
   * @returns A numeric assertion builder for response time in milliseconds
   */
  static responseTime () {
    return new NumericAssertionBuilder<AssertionSource>('RESPONSE_TIME')
  }
}

/** HTTP request body types supported by API checks */
export type BodyType = 'JSON' | 'FORM' | 'RAW' | 'GRAPHQL' | 'NONE'

/** HTTP request methods supported by API checks */
export type HttpRequestMethod =
  | 'get' | 'GET'
  | 'post' | 'POST'
  | 'put' | 'PUT'
  | 'patch' | 'PATCH'
  | 'head' | 'HEAD'
  | 'delete' | 'DELETE'
  | 'options' | 'OPTIONS'

/** IP family versions for network requests */
export type IPFamily = 'IPv4' | 'IPv6'

/**
 * Basic authentication credentials for HTTP requests.
 */
export interface BasicAuth {
  /** Username for basic authentication */
  username: string
  /** Password for basic authentication */
  password: string
}

/**
 * Default configuration that can be applied to API checks.
 * Used for setting common defaults across multiple checks.
 */
export type ApiCheckDefaultConfig = {
  /** Default URL for API requests */
  url?: string,
  /** Default HTTP headers to include */
  headers?: Array<HttpHeader>
  /** Default query parameters to include */
  queryParameters?: Array<QueryParam>
  /** Default basic authentication credentials */
  basicAuth?: BasicAuth
  /** Default assertions to apply */
  assertions?: Array<Assertion>
}

/**
 * Configuration for an HTTP request in an API check.
 * Defines all aspects of the HTTP request to be made.
 */
export interface Request {
  /** 
   * The URL to make the request to.
   * @maxLength 2048
   * @example 'https://api.example.com/users'
   */
  url: string,
  
  /** 
   * The HTTP method to use.
   * Supported methods: GET, POST, PUT, HEAD, DELETE, PATCH
   */
  method: HttpRequestMethod,
  
  /** 
   * IP family version to use for network requests.
   * @defaultValue 'IPv4'
   */
  ipFamily?: IPFamily,
  
  /** 
   * Whether to follow HTTP redirects automatically.
   * @defaultValue false
   */
  followRedirects?: boolean,
  
  /** 
   * Whether to skip SSL certificate verification.
   * @defaultValue false
   */
  skipSSL?: boolean,
  
  /**
   * Assertions to validate the HTTP response.
   * Check the main Checkly documentation on assertions for specific values like regular expressions
   * and JSON path descriptors you can use in the "property" field.
   */
  assertions?: Array<Assertion>
  
  /** The request body content */
  body?: string
  
  /** 
   * The type of the request body.
   * @defaultValue 'NONE'
   */
  bodyType?: BodyType
  
  /** HTTP headers to include in the request */
  headers?: Array<HttpHeader>
  
  /** Query parameters to include in the request URL */
  queryParameters?: Array<QueryParam>
  
  /** Basic authentication credentials */
  basicAuth?: BasicAuth
}

export interface ApiCheckProps extends CheckProps {
  /**
   *  Determines the request that the check is going to run.
   */
  request: Request
  /**
   * A valid piece of Node.js code to run in the setup phase.
   * @deprecated use the "setupScript" property instead
   */
  localSetupScript?: string
  /**
   * A valid piece of Node.js code to run in the setup phase.
   */
  setupScript?: Content|Entrypoint
  /**
   * A valid piece of Node.js code to run in the teardown phase.
   * @deprecated use the "tearDownScript" property instead
   */
  localTearDownScript?: string
  /**
   * A valid piece of Node.js code to run in the teardown phase.
   */
  tearDownScript?: Content|Entrypoint
  /**
   * The response time in milliseconds where a check should be considered degraded.
   * Used for performance monitoring and alerting on slow responses.
   * 
   * @defaultValue 10000
   * @minimum 0
   * @maximum 300000
   * @example
   * ```typescript
   * degradedResponseTime: 2000  // Alert when API responds slower than 2 seconds
   * ```
   */
  degradedResponseTime?: number
  
  /**
   * The response time in milliseconds where a check should be considered failing.
   * The check fails if the response takes longer than this threshold.
   * 
   * @defaultValue 20000
   * @minimum 0  
   * @maximum 300000
   * @example
   * ```typescript
   * maxResponseTime: 5000  // Fail check if API takes longer than 5 seconds
   * ```
   */
  maxResponseTime?: number
}

/**
 * Creates an API Check to monitor HTTP endpoints and APIs.
 * 
 * API checks allow you to monitor REST APIs, GraphQL endpoints, and any HTTP-based service.
 * You can validate response status codes, response times, headers, and response body content.
 *
 * @example
 * ```typescript
 * // Basic API check
 * new ApiCheck('hello-api', {
 *   name: 'Hello API',
 *   request: {
 *     method: 'GET',
 *     url: 'https://api.example.com/hello',
 *     assertions: [
 *       AssertionBuilder.statusCode().equals(200)
 *     ]
 *   }
 * })
 * 
 * // Advanced API check with POST request
 * new ApiCheck('user-api', {
 *   name: 'User API Check',
 *   frequency: Frequency.EVERY_5M,
 *   locations: ['us-east-1', 'eu-west-1'],
 *   request: {
 *     method: 'POST',
 *     url: 'https://api.example.com/users',
 *     headers: [{ key: 'Content-Type', value: 'application/json' }],
 *     body: JSON.stringify({ name: 'test-user' }),
 *     bodyType: 'JSON',
 *     assertions: [
 *       AssertionBuilder.statusCode().equals(201),
 *       AssertionBuilder.jsonBody('$.id').isNotNull(),
 *       AssertionBuilder.responseTime().lessThan(1000)
 *     ]
 *   },
 *   maxResponseTime: 5000,
 *   degradedResponseTime: 2000
 * })
 * 
 * // Error validation check (shouldFail required for error status checks)
 * new ApiCheck('not-found-check', {
 *   name: 'Not Found Check',
 *   shouldFail: true,
 *   request: {
 *     method: 'GET',
 *     url: 'https://api.example.com/nonexistent',
 *     assertions: [
 *       AssertionBuilder.statusCode().equals(404)
 *     ]
 *   }
 * })
 * ```
 * 
 * @see {@link https://www.checklyhq.com/docs/cli/constructs-reference/#apicheck | ApiCheck API Reference}
 * @see {@link https://www.checklyhq.com/docs/monitoring/api-checks/ | API Checks Documentation}
 */
export class ApiCheck extends Check {
  readonly request: Request
  readonly localSetupScript?: string
  readonly setupScript?: Content | Entrypoint
  readonly localTearDownScript?: string
  readonly tearDownScript?: Content | Entrypoint
  readonly degradedResponseTime?: number
  readonly maxResponseTime?: number

  /**
   * Constructs the API Check instance
   *
   * @param logicalId unique project-scoped resource name identification
   * @param props check configuration properties
   *
   * {@link https://checklyhq.com/docs/cli/constructs-reference/#apicheck Read more in the docs}
   */

  constructor (logicalId: string, props: ApiCheckProps) {
    super(logicalId, props)

    this.setupScript = props.setupScript
    this.localSetupScript = props.localSetupScript
    this.tearDownScript = props.tearDownScript
    this.localTearDownScript = props.localTearDownScript
    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    if (this.setupScript) {
      if (!isEntrypoint(this.setupScript) && !isContent(this.setupScript)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'setupScript',
          new Error(`Either "entrypoint" or "content" is required.`),
        ))
      } else if (isEntrypoint(this.setupScript) && isContent(this.setupScript)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'setupScript',
          new Error(`Provide exactly one of "entrypoint" or "content", but not both.`),
        ))
      } else if (isEntrypoint(this.setupScript)) {
        const entrypoint = this.resolveContentFilePath(this.setupScript.entrypoint)
        try {
          await fs.access(entrypoint, fs.constants.R_OK)
        } catch (err: any) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'setupScript',
            new Error(`Unable to access entrypoint file "${entrypoint}": ${err.message}`, { cause: err }),
          ))
        }
      }
    }

    if (this.localSetupScript) {
      diagnostics.add(new DeprecatedPropertyDiagnostic(
        'localSetupScript',
        new Error(`Use "setupScript" instead.`),
      ))
    }

    if (this.tearDownScript) {
      if (!isEntrypoint(this.tearDownScript) && !isContent(this.tearDownScript)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'tearDownScript',
          new Error(`Either "entrypoint" or "content" is required.`),
        ))
      } else if (isEntrypoint(this.tearDownScript) && isContent(this.tearDownScript)) {
        diagnostics.add(new InvalidPropertyValueDiagnostic(
          'tearDownScript',
          new Error(`Provide exactly one of "entrypoint" or "content", but not both.`),
        ))
      } else if (isEntrypoint(this.tearDownScript)) {
        const entrypoint = this.resolveContentFilePath(this.tearDownScript.entrypoint)
        try {
          await fs.access(entrypoint, fs.constants.R_OK)
        } catch (err: any) {
          diagnostics.add(new InvalidPropertyValueDiagnostic(
            'tearDownScript',
            new Error(`Unable to access entrypoint file "${entrypoint}": ${err.message}`, { cause: err }),
          ))
        }
      }
    }

    if (this.localTearDownScript) {
      diagnostics.add(new DeprecatedPropertyDiagnostic(
        'localTearDownScript',
        new Error(`Use "tearDownScript" instead.`),
      ))
    }
  }

  async bundle (): Promise<ApiCheckBundle> {
    const props: ApiCheckBundleProps = {}

    if (this.localSetupScript) {
      props.localSetupScript = this.localSetupScript
    }

    if (this.setupScript) {
      if (isEntrypoint(this.setupScript)) {
        const { script, scriptPath, dependencies } = await ApiCheck.bundle(
          this.resolveContentFilePath(this.setupScript.entrypoint),
          this.runtimeId,
        )
        props.localSetupScript = script
        props.setupScriptPath = scriptPath
        props.setupScriptDependencies = dependencies
      } else {
        props.localSetupScript = this.setupScript.content
      }
    }

    if (this.localTearDownScript) {
      props.localTearDownScript = this.localTearDownScript
    }

    if (this.tearDownScript) {
      if (isEntrypoint(this.tearDownScript)) {
        const { script, scriptPath, dependencies } = await ApiCheck.bundle(
          this.resolveContentFilePath(this.tearDownScript.entrypoint),
          this.runtimeId,
        )
        props.localTearDownScript = script
        props.tearDownScriptPath = scriptPath
        props.tearDownScriptDependencies = dependencies
      } else {
        props.localTearDownScript = this.tearDownScript.content
      }
    }

    return new ApiCheckBundle(this, props)
  }

  static async bundle (entrypoint: string, runtimeId?: string) {
    const runtime = Session.getRuntime(runtimeId)
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = Session.getParser(runtime)
    const parsed = await parser.parse(entrypoint)
    // Maybe we can get the parsed deps with the content immediately

    const deps: SharedFileRef[] = []
    for (const { filePath, content } of parsed.dependencies) {
      deps.push(Session.registerSharedFile({
        path: Session.relativePosixPath(filePath),
        content,
      }))
    }
    return {
      script: parsed.entrypoint.content,
      scriptPath: Session.relativePosixPath(parsed.entrypoint.filePath),
      dependencies: deps,
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'API',
      request: this.request,
      localSetupScript: this.localSetupScript,
      localTearDownScript: this.localTearDownScript,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }
}
