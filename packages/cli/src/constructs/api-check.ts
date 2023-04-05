import * as path from 'path'
import { Check, CheckProps } from './check'
import { HttpHeader } from './http-header'
import { Session } from './project'
import { QueryParam } from './query-param'
import { Parser } from '../services/check-parser/parser'
import { pathToPosix, isFileSync } from '../services/util'
import { printDeprecationWarning } from '../reporters/util'
import { Content, Entrypoint } from './construct'

// eslint-disable-next-line no-restricted-syntax
enum AssertionSource {
  STATUS_CODE = 'STATUS_CODE',
  JSON_BODY = 'JSON_BODY',
  HEADERS = 'HEADERS',
  TEXT_BODY = 'TEXT_BODY',
  RESPONSE_TIME = 'RESPONSE_TIME',
}

// eslint-disable-next-line no-restricted-syntax
enum AssertionComparison {
  EQUALS = 'EQUALS',
  NOT_EQUALS = 'NOT_EQUALS',
  HAS_KEY = 'HAS_KEY',
  NOT_HAS_KEY = 'NOT_HAS_KEY',
  HAS_VALUE = 'HAS_VALUE',
  NOT_HAS_VALUE = 'NOT_HAS_VALUE',
  IS_EMPTY = 'IS_EMPTY',
  NOT_EMPTY = 'NOT_EMPTY',
  GREATER_THAN = 'GREATER_THAN',
  LESS_THAN = 'LESS_THAN',
  CONTAINS = 'CONTAINS',
  NOT_CONTAINS = 'NOT_CONTAINS',
  IS_NULL = 'IS_NULL',
  NOT_NULL = 'NOT_NULL',
}

export interface Assertion {
  source: string,
  property: string,
  comparison: string,
  target: string,
  regex: string|null,
}

export class AssertionBuilder {
  static statusCode () {
    return new NumericAssertionBuilder(AssertionSource.STATUS_CODE)
  }

  static jsonBody (property?: string) {
    return new GeneralAssertionBuilder(AssertionSource.JSON_BODY, property)
  }

  static headers (property?: string, regex?: string) {
    return new GeneralAssertionBuilder(AssertionSource.HEADERS, property, regex)
  }

  static textBody (property?: string) {
    return new GeneralAssertionBuilder(AssertionSource.TEXT_BODY, property)
  }

  static responseTme () {
    return new NumericAssertionBuilder(AssertionSource.RESPONSE_TIME)
  }
}

class NumericAssertionBuilder {
  source: AssertionSource
  constructor (source: AssertionSource) {
    this.source = source
  }

  equals (target: number): Assertion {
    return this._toAssertion(AssertionComparison.EQUALS, target)
  }

  notEquals (target: number): Assertion {
    return this._toAssertion(AssertionComparison.NOT_EQUALS, target)
  }

  lessThan (target: number): Assertion {
    return this._toAssertion(AssertionComparison.LESS_THAN, target)
  }

  greaterThan (target: number): Assertion {
    return this._toAssertion(AssertionComparison.GREATER_THAN, target)
  }

  /** @private */
  private _toAssertion (comparison: AssertionComparison, target: number): Assertion {
    return { source: this.source, comparison, property: '', target: target.toString(), regex: null }
  }
}

class GeneralAssertionBuilder {
  source: AssertionSource
  property?: string
  regex?: string
  constructor (source: AssertionSource, property?: string, regex?: string) {
    this.source = source
    this.property = property
    this.regex = regex
  }

  equals (target: string|number|boolean): Assertion {
    return this._toAssertion(AssertionComparison.EQUALS, target)
  }

  notEquals (target: string|number|boolean): Assertion {
    return this._toAssertion(AssertionComparison.NOT_EQUALS, target)
  }

  hasKey (target: string): Assertion {
    return this._toAssertion(AssertionComparison.HAS_KEY, target)
  }

  notHasKey (target: string): Assertion {
    return this._toAssertion(AssertionComparison.NOT_HAS_KEY, target)
  }

  hasValue (target: string|number|boolean): Assertion {
    return this._toAssertion(AssertionComparison.HAS_VALUE, target)
  }

  notHasValue (target: string|number|boolean): Assertion {
    return this._toAssertion(AssertionComparison.NOT_HAS_VALUE, target)
  }

  isEmpty () {
    return this._toAssertion(AssertionComparison.IS_EMPTY)
  }

  notEmpty () {
    return this._toAssertion(AssertionComparison.NOT_EMPTY)
  }

  lessThan (target: string|number|boolean): Assertion {
    return this._toAssertion(AssertionComparison.LESS_THAN, target)
  }

  greaterThan (target: string|number|boolean): Assertion {
    return this._toAssertion(AssertionComparison.GREATER_THAN, target)
  }

  contains (target: string): Assertion {
    return this._toAssertion(AssertionComparison.CONTAINS, target)
  }

  notContains (target: string): Assertion {
    return this._toAssertion(AssertionComparison.CONTAINS, target)
  }

  isNull () {
    return this._toAssertion(AssertionComparison.IS_NULL)
  }

  isNotNull () {
    return this._toAssertion(AssertionComparison.NOT_NULL)
  }

  /** @private */
  private _toAssertion (comparison: AssertionComparison, target?: string|number|boolean): Assertion {
    return {
      source: this.source,
      comparison,
      property: this.property ?? '',
      target: target?.toString() ?? '',
      regex: this.regex ?? null,
    }
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

export interface BasicAuth {
  username: string
  password: string
}

export type ApiCheckDefaultConfig = {
  url?: string,
  headers?: Array<HttpHeader>
  queryParameters?: Array<QueryParam>
  basicAuth?: BasicAuth
}

export interface Request {
  url: string,
  method: HttpRequestMethod,
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
   * {@link https://checklyhq.com/docs/cli/constructs/#apicheck Read more in the docs}
   */

  constructor (logicalId: string, props: ApiCheckProps) {
    super(logicalId, props)

    if (props.setupScript) {
      if ('entrypoint' in props.setupScript && isFileSync(props.setupScript.entrypoint)) {
        const { script, scriptPath, dependencies } = ApiCheck.bundle(props.setupScript.entrypoint, this.runtimeId!)
        this.localSetupScript = script
        this.setupScriptPath = scriptPath
        this.setupScriptDependencies = dependencies
      } else if ('content' in props.setupScript) {
        this.localSetupScript = props.setupScript.content
      } else {
        throw new Error('Unrecognized type for setupScript property')
      }
    }

    if (props.localSetupScript) {
      _printWarning(Session.checkFilePath)
      this.localSetupScript = props.localSetupScript
    }

    if (props.tearDownScript) {
      if ('entrypoint' in props.tearDownScript && isFileSync(props.tearDownScript.entrypoint)) {
        const { script, scriptPath, dependencies } = ApiCheck.bundle(props.tearDownScript.entrypoint, this.runtimeId!)
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
  }

  static bundle (entrypoint: string, runtimeId: string) {
    let absoluteEntrypoint = null
    if (path.isAbsolute(entrypoint)) {
      absoluteEntrypoint = entrypoint
    } else {
      if (!Session.checkFileAbsolutePath) {
        throw new Error('You cant use relative paths without the checkFileAbsolutePath in session')
      }
      absoluteEntrypoint = path.join(path.dirname(Session.checkFileAbsolutePath), entrypoint)
    }

    const runtime = Session.availableRuntimes[runtimeId]
    if (!runtime) {
      throw new Error(`${runtimeId} is not supported`)
    }
    const parser = new Parser(Object.keys(runtime.dependencies))
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
}
