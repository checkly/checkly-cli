import * as path from 'path'
import { Check, CheckProps } from './check'
import { HttpHeader } from './http-header'
import { Session } from './project'
import { QueryParam } from './query-param'
import { pathToPosix } from '../services/util'
import { printDeprecationWarning } from '../reporters/util'
import { Content, Entrypoint } from './construct'
import { Assertion as CoreAssertion, NumericAssertionBuilder, GeneralAssertionBuilder, sourceForNumericAssertion, sourceForGeneralAssertion } from './internal/assertion'
import { expr, ident, Program, Value } from '../sourcegen'
import { sourceForKeyValuePair } from './key-value-pair'

type AssertionSource =
  | 'STATUS_CODE'
  | 'JSON_BODY'
  | 'HEADERS'
  | 'TEXT_BODY'
  | 'RESPONSE_TIME'

export type Assertion = CoreAssertion<AssertionSource>

export class AssertionBuilder {
  static statusCode () {
    return new NumericAssertionBuilder<AssertionSource>('STATUS_CODE')
  }

  static jsonBody (property?: string) {
    return new GeneralAssertionBuilder<AssertionSource>('JSON_BODY', property)
  }

  static headers (property?: string, regex?: string) {
    return new GeneralAssertionBuilder<AssertionSource>('HEADERS', property, regex)
  }

  static textBody (property?: string) {
    return new GeneralAssertionBuilder<AssertionSource>('TEXT_BODY', property)
  }

  /** @deprecated Use responseTime() instead */
  static responseTme () {
    return new NumericAssertionBuilder<AssertionSource>('RESPONSE_TIME')
  }

  static responseTime () {
    return new NumericAssertionBuilder<AssertionSource>('RESPONSE_TIME')
  }
}

function _printWarning (path: string | undefined): void {
  printDeprecationWarning(`API check "${path}" is probably providing a setup ` +
  'or tearDown script using the "localSetupScript" or "localTearDownScript" property. Please update your API checks to ' +
  'reference any setup / tearDown using the "setupScript" and "tearDownScript" properties See the docs at ' +
  'https://checklyhq.com/docs/cli/constructs-reference#apicheck')
}

export type BodyType = 'JSON' | 'FORM' | 'RAW' | 'GRAPHQL' | 'NONE'

export type HttpRequestMethod =
  | 'get' | 'GET'
  | 'post' | 'POST'
  | 'put' | 'PUT'
  | 'patch' | 'PATCH'
  | 'head' | 'HEAD'
  | 'delete' | 'DELETE'
  | 'options' | 'OPTIONS'

export type IPFamily = 'IPv4' | 'IPv6'
export interface BasicAuth {
  username: string
  password: string
}

export type ApiCheckDefaultConfig = {
  url?: string,
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  basicAuth?: BasicAuth
  assertions?: Array<Assertion>
}

export interface Request {
  url: string,
  method: HttpRequestMethod,
  ipFamily?: IPFamily,
  followRedirects?: boolean,
  skipSSL?: boolean,
  /**
   * Check the main Checkly documentation on assertions for specific values like regular expressions
   * and JSON path descriptors you can use in the "property" field.
   */
  assertions?: Array<Assertion>
  body?: string
  bodyType?: BodyType
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  basicAuth?: BasicAuth
}

export interface ScriptDependency {
  path: string
  content: string
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
   */
  degradedResponseTime?: number
  /**
   * The response time in milliseconds where a check should be considered failing.
   */
  maxResponseTime?: number
}

/**
 * Creates an API Check
 *
 * @remarks
 *
 * This class make use of the API Checks endpoints.
 */
export class ApiCheck extends Check {
  request: Request
  localSetupScript?: string
  localTearDownScript?: string
  degradedResponseTime?: number
  maxResponseTime?: number
  private readonly setupScriptDependencies?: Array<ScriptDependency>
  private readonly tearDownScriptDependencies?: Array<ScriptDependency>
  private readonly setupScriptPath?: string
  private readonly tearDownScriptPath?: string

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

    if (props.setupScript) {
      if ('entrypoint' in props.setupScript) {
        const { script, scriptPath, dependencies } = ApiCheck.bundle(props.setupScript.entrypoint, this.runtimeId)
        this.localSetupScript = script
        this.setupScriptPath = scriptPath
        this.setupScriptDependencies = dependencies
      } else if ('content' in props.setupScript) {
        this.localSetupScript = props.setupScript.content
      } else {
        throw new Error('Unrecognized type for the "setupScript" property. A "setupScript" should have either a "content" ' +
            'or "entrypoint" property.')
      }
    }

    if (props.localSetupScript) {
      _printWarning(Session.checkFilePath)
      this.localSetupScript = props.localSetupScript
    }

    if (props.tearDownScript) {
      if ('entrypoint' in props.tearDownScript) {
        const { script, scriptPath, dependencies } = ApiCheck.bundle(props.tearDownScript.entrypoint, this.runtimeId)
        this.localTearDownScript = script
        this.tearDownScriptPath = scriptPath
        this.tearDownScriptDependencies = dependencies
      } else if ('content' in props.tearDownScript) {
        this.localTearDownScript = props.tearDownScript.content
      }
    }

    if (props.localTearDownScript) {
      _printWarning(Session.checkFilePath)
      this.localTearDownScript = props.localTearDownScript
    }

    this.request = props.request
    this.degradedResponseTime = props.degradedResponseTime
    this.maxResponseTime = props.maxResponseTime

    Session.registerConstruct(this)
    this.addSubscriptions()
    this.addPrivateLocationCheckAssignments()
  }

  static bundle (entrypoint: string, runtimeId?: string) {
    let absoluteEntrypoint = null
    if (path.isAbsolute(entrypoint)) {
      absoluteEntrypoint = entrypoint
    } else {
      if (!Session.checkFileAbsolutePath) {
        throw new Error('You cant use relative paths without the checkFileAbsolutePath in session')
      }
      absoluteEntrypoint = path.join(path.dirname(Session.checkFileAbsolutePath), entrypoint)
    }

    const runtime = Session.getRuntime(runtimeId)
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = Session.getParser(runtime)
    const parsed = parser.parse(absoluteEntrypoint)
    // Maybe we can get the parsed deps with the content immediately

    const deps: ScriptDependency[] = []
    for (const { filePath, content } of parsed.dependencies) {
      deps.push({
        path: pathToPosix(path.relative(Session.basePath!, filePath)),
        content,
      })
    }
    return {
      script: parsed.entrypoint.content,
      scriptPath: pathToPosix(path.relative(Session.basePath!, parsed.entrypoint.filePath)),
      dependencies: deps,
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'API',
      request: this.request,
      localSetupScript: this.localSetupScript,
      setupScriptPath: this.setupScriptPath,
      setupScriptDependencies: this.setupScriptDependencies,
      localTearDownScript: this.localTearDownScript,
      tearDownScriptPath: this.tearDownScriptPath,
      tearDownScriptDependencies: this.tearDownScriptDependencies,
      degradedResponseTime: this.degradedResponseTime,
      maxResponseTime: this.maxResponseTime,
    }
  }

  source (program: Program): void {
    program.import('ApiCheck', 'checkly/constructs')

    program.value(expr(ident('ApiCheck'), builder => {
      builder.new(builder => {
        builder.string(this.logicalId)
        builder.object(builder => {
          builder.object('request', builder => {
            builder.string('url', this.request.url)
            builder.string('method', this.request.method)

            if (this.request.ipFamily) {
              builder.string('ipFamily', this.request.ipFamily)
            }

            if (this.request.followRedirects !== undefined) {
              builder.boolean('followRedirects', this.request.followRedirects)
            }

            if (this.request.skipSSL !== undefined) {
              builder.boolean('skipSSL', this.request.skipSSL)
            }

            if (this.request.assertions) {
              const assertions = this.request.assertions
              builder.array('assertions', builder => {
                for (const assertion of assertions) {
                  builder.value(sourceForAssertion(program, assertion))
                }
              })
            }

            if (this.request.body) {
              builder.string('body', this.request.body)
            }

            if (this.request.bodyType) {
              builder.string('bodyType', this.request.bodyType)
            }

            if (this.request.headers) {
              const headers = this.request.headers
              builder.array('headers', builder => {
                for (const header of headers) {
                  builder.value(sourceForKeyValuePair(header))
                }
              })
            }

            if (this.request.queryParameters) {
              const queryParameters = this.request.queryParameters
              builder.array('queryParameters', builder => {
                for (const param of queryParameters) {
                  builder.value(sourceForKeyValuePair(param))
                }
              })
            }

            if (this.request.basicAuth) {
              const basicAuth = this.request.basicAuth
              builder.object('basicAuth', builder => {
                builder.string('username', basicAuth.username)
                builder.string('password', basicAuth.password)
              })
            }
          })

          if (this.localSetupScript) {
            const content = this.localSetupScript
            builder.object('setupScript', builder => {
              builder.string('content', content)
            })
          }

          if (this.setupScriptPath) {
            const scriptPath = this.setupScriptPath
            builder.object('setupScript', builder => {
              // @TODO needs work
              builder.string('entrypoint', scriptPath)
            })
          }

          if (this.localTearDownScript) {
            const content = this.localTearDownScript
            builder.object('tearDownScript', builder => {
              builder.string('content', content)
            })
          }

          if (this.tearDownScriptPath) {
            const scriptPath = this.tearDownScriptPath
            builder.object('tearDownScript', builder => {
              // @TODO needs work
              builder.string('entrypoint', scriptPath)
            })
          }

          if (this.degradedResponseTime !== undefined) {
            builder.number('degradedResponseTime', this.degradedResponseTime)
          }

          if (this.maxResponseTime !== undefined) {
            builder.number('maxResponseTime', this.maxResponseTime)
          }

          this.buildSourceForCheckProps(program, builder)
        })
      })
    }))
  }
}

export function sourceForAssertion (program: Program, assertion: Assertion): Value {
  program.import('AssertionBuilder', 'checkly/constructs')

  switch (assertion.source as AssertionSource) {
    case 'STATUS_CODE':
      return sourceForNumericAssertion('AssertionBuilder', 'statusCode', assertion)
    case 'JSON_BODY':
      return sourceForGeneralAssertion('AssertionBuilder', 'jsonBody', assertion)
    case 'HEADERS':
      return sourceForGeneralAssertion('AssertionBuilder', 'headers', assertion)
    case 'TEXT_BODY':
      return sourceForGeneralAssertion('AssertionBuilder', 'textBody', assertion)
    case 'RESPONSE_TIME':
      return sourceForNumericAssertion('AssertionBuilder', 'responseTime', assertion)
    default:
      throw new Error(`Unsupported assertion source ${assertion.source}`)
  }
}
