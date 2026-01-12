import { isIPv6 } from 'node:net'

import chalk from 'chalk'
import indentString from 'indent-string'
import { DateTime } from 'luxon'
import * as logSymbols from 'log-symbols'

import { getDefaults } from '../rest/api'
import { Assertion } from '../constructs/internal/assertion'

// eslint-disable-next-line no-restricted-syntax
export enum CheckStatus {
  SCHEDULING,
  RUNNING,
  RETRIED,
  FAILED,
  SUCCESSFUL,
  DEGRADED,
}

export function formatDuration (ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`
  } else {
    return `${Math.ceil(ms / 1000)}s`
  }
}

export function formatCheckTitle (
  status: CheckStatus,
  check: any,
  opts: { includeSourceFile?: boolean, printRetryDuration?: boolean } = {},
) {
  let duration
  if ((opts.printRetryDuration || status !== CheckStatus.RETRIED) && check.startedAt && check.stoppedAt) {
    const durationMs = DateTime.fromISO(check.stoppedAt)
      .diff(DateTime.fromISO(check.startedAt))
      .toMillis()
    duration = formatDuration(durationMs)
  }

  let statusString
  let format
  if (status === CheckStatus.SUCCESSFUL) {
    statusString = chalk.bold.green(logSymbols.success)
    format = chalk.bold
  } else if (status === CheckStatus.FAILED) {
    statusString = logSymbols.error
    format = chalk.bold.red
  } else if (status === CheckStatus.DEGRADED) {
    statusString = logSymbols.warning
    format = chalk.bold.yellow
  } else if (status === CheckStatus.SCHEDULING) {
    statusString = '~'
    format = chalk.bold.dim
  } else if (status === CheckStatus.RETRIED) {
    statusString = '↺'
    format = chalk.bold
  } else {
    statusString = '-'
    format = chalk.bold.dim
  }

  return [
    format(statusString),
    opts.includeSourceFile ? format(`${check.sourceFile} >`) : undefined,
    format(check.name),
    duration ? `(${duration})` : undefined,
  ].filter(Boolean).join(' ')
}

export function formatCheckResult (checkResult: any) {
  const result = []
  if (checkResult.checkType === 'API' || checkResult.checkType === 'URL') {
    // Order should follow the check lifecycle (response, then assertions)
    if (checkResult.checkRunData?.requestError) {
      result.push([
        formatSectionTitle('Request Error'),
        checkResult.checkRunData.requestError,
      ])
    } else {
      if (checkResult.checkRunData?.request) {
        result.push([
          formatSectionTitle('HTTP Request'),
          formatHttpRequest(checkResult.checkRunData.request),
        ])
      }
      if (checkResult.checkRunData?.response) {
        result.push([
          formatSectionTitle('HTTP Response'),
          formatHttpResponse(checkResult.checkRunData.response),
        ])
      }
      if (checkResult.checkRunData?.assertions?.length) {
        result.push([
          formatSectionTitle('Assertions'),
          formatAssertions(checkResult.checkRunData.assertions),
        ])
      }
      if (checkResult.logs?.request.length) {
        result.push([
          formatSectionTitle('Request Logs'),
          formatLogs(checkResult.logs.request),
        ])
      }
      if (checkResult.logs?.setup.length) {
        result.push([
          formatSectionTitle('Setup Script Logs'),
          formatLogs(checkResult.logs.setup),
        ])
      }
      if (checkResult.logs?.teardown.length) {
        result.push([
          formatSectionTitle('Teardown Script Logs'),
          formatLogs(checkResult.logs.teardown),
        ])
      }
    }
  }
  if (checkResult.checkType === 'DNS') {
    if (checkResult.checkRunData?.requestError) {
      result.push([
        formatSectionTitle('Request Error'),
        checkResult.checkRunData.requestError,
      ])
    } else {
      if (checkResult.checkRunData?.request) {
        result.push([
          formatSectionTitle('DNS Request'),
          formatDnsRequest(checkResult.checkRunData.request),
        ])
      }
      if (checkResult.checkRunData?.nameServerInfo) {
        result.push([
          formatSectionTitle('Name Server Information'),
          formatDnsNameServerInfo(checkResult.checkRunData.nameServerInfo),
        ])
      }
      if (checkResult.checkRunData?.response) {
        result.push([
          formatSectionTitle('DNS Response'),
          formatDnsResponse(checkResult.checkRunData.response),
        ])
      }
      if (checkResult.checkRunData?.assertions?.length) {
        result.push([
          formatSectionTitle('Assertions'),
          formatAssertions(checkResult.checkRunData.assertions, {
            truncate: {
              chars: Infinity,
              lines: Infinity,
            },
          }),
        ])
      }
    }
  }
  if (checkResult.checkType === 'TCP') {
    if (checkResult.checkRunData?.requestError) {
      result.push([
        formatSectionTitle('Request Error'),
        checkResult.checkRunData.requestError,
      ])
    } else {
      if (checkResult.checkRunData?.response?.error) {
        result.push([
          formatSectionTitle('Connection Error'),
          formatConnectionError(checkResult.checkRunData?.response?.error),
        ])
      }
      if (checkResult.checkRunData?.assertions?.length) {
        result.push([
          formatSectionTitle('Assertions'),
          formatAssertions(checkResult.checkRunData.assertions),
        ])
      }
    }
  }
  if (checkResult.logs?.length) {
    result.push([
      formatSectionTitle('Logs'),
      formatLogs(checkResult.logs),
    ])
  }
  if (checkResult.runError) {
    result.push([
      formatSectionTitle('Execution Error'),
      formatRunError(checkResult.runError),
    ])
  }
  if (checkResult.scheduleError) {
    result.push([
      formatSectionTitle('Scheduling Error'),
      formatRunError(checkResult.scheduleError),
    ])
  }
  return result.map(([title, body]) => title + '\n' + body).join('\n\n')
}

const assertionSources: any = {
  STATUS_CODE: 'status code',
  JSON_BODY: 'JSON body',
  HEADERS: 'headers',
  TEXT_BODY: 'text body',
  RESPONSE_TIME: 'response time',
  RESPONSE_DATA: 'response data',
  TEXT_ANSWER: 'answer (text)',
  JSON_ANSWER: 'answer (JSON)',
  RESPONSE_CODE: 'response code',
}

const assertionComparisons: any = {
  EQUALS: 'equals',
  NOT_EQUALS: 'doesn\'t equal',
  HAS_KEY: 'has key',
  NOT_HAS_KEY: 'doesn\'t have key',
  HAS_VALUE: 'has value',
  NOT_HAS_VALUE: 'doesn\'t have value',
  IS_EMPTY: 'is empty',
  NOT_EMPTY: 'is not empty',
  GREATER_THAN: 'is greater than',
  LESS_THAN: 'is less than',
  CONTAINS: 'contains',
  NOT_CONTAINS: 'doesn\'t contain',
  IS_NULL: 'is null',
  NOT_NULL: 'is not null',
}

type formatAssertionsOptions = {
  truncate?: TruncateOptions
}

function formatAssertions (
  assertions: Array<Assertion<string> & { error: string, actual: any }>,
  options?: formatAssertionsOptions,
) {
  return assertions.map(({ source, property, comparison, target, regex, error, actual }) => {
    const assertionFailed = !!error
    const humanSource = assertionSources[source] || source
    const humanComparison = assertionComparisons[comparison] || comparison
    let actualString
    if (actual) {
      const { result: truncatedActual, lines: truncatedActualLines } = truncate(actual, {
        chars: 300,
        lines: 5,
        ending: chalk.magenta('\n...truncated...'),
        ...options?.truncate,
      })

      if (truncatedActualLines <= 1) {
        actualString = `Received: ${truncatedActual}.`
      } else {
        actualString = `Received:\n${indentString(truncatedActual, 4, { indent: ' ' })}`
      }
    }
    const message = [
      assertionFailed ? logSymbols.error : logSymbols.success,
      humanSource,
      property ? `property "${property}"` : undefined,
      regex ? `regex "${regex}"` : undefined,
      humanComparison,
      `target "${target}".`,
      actualString,
    ].filter(Boolean).join(' ')
    return assertionFailed ? chalk.red(message) : chalk.green(message)
  }).join('\n')
}

function formatHttpRequest (request: any) {
  const { result: stringBody } = truncate(request.data, {
    chars: 20 * 100,
    lines: 20,
    ending: chalk.magenta('\n...truncated...'),
  })
  const headersString = Object.entries(request.headers ?? []).map(([key, val]) => `${key}: ${val}`).join('\n')
  return [
    `${request.method} ${request.url}`,
    'Headers:',
    indentString(headersString, 2),
    request.data ? 'Body:' : undefined,
    indentString(stringBody, 2),
  ].filter(Boolean).join('\n')
}

function formatHttpResponse (response: any) {
  // TODO: Provide a user for a way to see the full response. For example, write it to a file.
  const { result: stringBody } = truncate(response.body, {
    chars: 20 * 100,
    lines: 20,
    ending: chalk.magenta('\n...truncated...'),
  })
  const headersString = Object.entries(response.headers ?? []).map(([key, val]) => `${key}: ${val}`).join('\n')
  return [
    `Status Code: ${response.status} ${response.statusText}`,
    'Headers:',
    indentString(headersString, 2),
    response.body ? 'Body:' : undefined,
    indentString(stringBody, 2),
  ].filter(Boolean).join('\n')
}

type DNSRequest = {
  query: string
  recordType: string
  protocol: string
  nameServer?: string
  port?: number | null
}

function formatDnsRequest (request: DNSRequest) {
  return [
    `Query: ${request.query}`,
    `Record Type: ${request.recordType}`,
    request.nameServer ? `Name Server: ${formatHostPort(request.nameServer, request.port)}` : '',
    `Protocol: ${request.protocol}`,
  ].filter(Boolean).join('\n')
}

type NameServerInfo = {
  name?: string
  host: string
  port: number
}

function formatDnsNameServerInfo (nameServerInfo: NameServerInfo) {
  return [
    nameServerInfo.name ? `Name: ${nameServerInfo.name}` : '',
    `Server: ${formatHostPort(nameServerInfo.host, nameServerInfo.port)}`,
  ].filter(Boolean).join('\n')
}

type DNSResponse = {
  returnCode: string
  answer: string
  responseTime: number
}

function formatDnsResponse (response: DNSResponse) {
  return [
    `Return Code: ${response.returnCode}`,
    `Response Time: ${formatDuration(response.responseTime)}`,
    response.answer ? 'Answer:' : undefined,
    indentString(response.answer, 2),
  ].filter(Boolean).join('\n')
}

// IPv4 lookup for a non-existing hostname:
//
//   {
//     "code": "ENOTFOUND",
//     "syscall": "queryA",
//     "hostname": "does-not-exist.checklyhq.com"
//   }
//
// IPv6 lookup for a non-existing hostname:
//
//   {
//     "code": "ENOTFOUND",
//     "syscall": "queryAaaa",
//     "hostname": "does-not-exist.checklyhq.com"
//   }
interface DNSLookupFailureError {
  code: 'ENOTFOUND'
  syscall: string
  hostname: string
}

function isDNSLookupFailureError (error: any): error is DNSLookupFailureError {
  return error.code === 'ENOTFOUND'
    && typeof error.syscall === 'string'
    && typeof error.hostname === 'string'
}

// Connection attempt to a port that isn't open:
//
//   {
//     "errno": -111,
//     "code": "ECONNREFUSED",
//     "syscall": "connect",
//     "address": "127.0.0.1",
//     "port": 22
//   }
//
interface ConnectionRefusedError {
  code: 'ECONNREFUSED'
  errno?: number
  syscall: string
  address: string
  port: number
}

function isConnectionRefusedError (error: any): error is ConnectionRefusedError {
  return error.code === 'ECONNREFUSED'
    && typeof error.syscall === 'string'
    && typeof error.address === 'string'
    && typeof error.port === 'number'
    && typeof (error.errno ?? 0) === 'number'
}

// Connection kept open after data exchange and it timed out:
//
//   {
//     "code": "SOCKET_TIMEOUT",
//     "address": "api.checklyhq.com",
//     "port": 9999
//   }
interface SocketTimeoutError {
  code: 'SOCKET_TIMEOUT'
  address: string
  port: number
}

function isSocketTimeoutError (error: any): error is SocketTimeoutError {
  return error.code === 'SOCKET_TIMEOUT'
    && typeof error.address === 'string'
    && typeof error.port === 'number'
}

// Invalid IP address (e.g. IPv4-only hostname when IPFamily is IPv6)
//
//   {
//     "code": "ERR_INVALID_IP_ADDRESS",
//   }
interface InvalidIPAddressError {
  code: 'ERR_INVALID_IP_ADDRESS'
}

function isInvalidIPAddressError (error: any): error is InvalidIPAddressError {
  return error.code === 'ERR_INVALID_IP_ADDRESS'
}

function formatConnectionError (error: any) {
  if (isDNSLookupFailureError(error)) {
    const message = [
      logSymbols.error,
      `DNS lookup for "${error.hostname}" failed`,
      `(syscall: ${error.syscall})`,
    ].join(' ')
    return chalk.red(message)
  }

  if (isConnectionRefusedError(error)) {
    const message = [
      logSymbols.error,
      `Connection to "${error.address}:${error.port}" was refused`,
      `(syscall: ${error.syscall}, errno: ${error.errno ?? '<None>'})`,
    ].join(' ')
    return chalk.red(message)
  }

  if (isSocketTimeoutError(error)) {
    const message = [
      logSymbols.error,
      `Connection to "${error.address}:${error.port}" timed out (perhaps connection was never closed)`,
    ].join(' ')
    return chalk.red(message)
  }

  if (isInvalidIPAddressError(error)) {
    const message = [
      logSymbols.error,
      'Invalid IP address (perhaps hostname and IP family do not match)',
    ].join(' ')
    return chalk.red(message)
  }

  // Some other error we don't have detection for.
  if (error.code !== undefined) {
    const { code, ...extra } = error
    const detailsString = JSON.stringify(extra)
    const message = [
      logSymbols.error,
      `${code} (details: ${detailsString})`,
    ].join(' ')
    return chalk.red(message)
  }

  // If we don't even have a code, give up and output the whole thing.
  const detailsString = JSON.stringify(error)
  const message = [
    logSymbols.error,
    `Error (details: ${detailsString})`,
  ].join(' ')
  return chalk.red(message)
}

function formatLogs (logs: Array<{ level: string, msg: string, time: number }>) {
  return logs.flatMap(({ level, msg, time }) => {
    const timestamp = DateTime.fromMillis(time).toLocaleString(DateTime.TIME_24_WITH_SECONDS)
    let format = chalk.dim
    if (level === 'WARN') {
      format = chalk.dim.yellow
    } else if (level === 'ERROR') {
      format = chalk.dim.red
    }
    const [firstLine, ...remainingLines] = msg.split('\n')
    return [
      `${timestamp} ${level.padEnd(5, ' ')} ${format(firstLine)}`,
      ...remainingLines.map(line => format(line)),
    ]
  }).join('\n')
}

function formatRunError (err: string | Error): string {
  if (typeof err === 'string') {
    return err
  } else {
    return err.message
  }
}

function formatSectionTitle (title: string): string {
  const width = process.stdout.isTTY ? process.stdout.columns : 80
  // For style reasons, we only extend the title with "----" to a maximum of 80 characters
  const targetTitleWidth = Math.min(width, 80)
  const leftPaddingLength = 6 // Account for an indent of 4 and two dashes
  // On CI, process.stdout.columns might be 0
  // We take Math.max(0, ...) to avoid a negative padding length from causing errors
  const rightPaddingLength = Math.max(0, targetTitleWidth - title.length - leftPaddingLength)
  return `──${chalk.bold(title)}${'─'.repeat(rightPaddingLength)}`
}

type TruncateOptions = {
  chars?: number
  lines?: number
  ending?: string
}

function truncate (val: any, opts: TruncateOptions) {
  let truncated = false
  let result = toString(val)
  if (opts.chars && val.length > opts.chars) {
    truncated = true
    result = result.substring(0, opts.chars)
  }
  const lines = result.split('\n')
  if (opts.lines && lines.length > opts.lines) {
    truncated = true
    result = lines.slice(0, opts.lines).join('\n')
  }
  return {
    truncated,
    result: truncated && opts.ending ? result + opts.ending : result,
    lines: opts.lines ? Math.min(opts.lines, lines.length) : lines.length,
  }
}

function toString (val: any): string {
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2)
  } else {
    return val.toString()
  }
}

export function resultToCheckStatus (checkResult: any): CheckStatus {
  return checkResult.hasFailures
    ? CheckStatus.FAILED
    : checkResult.isDegraded
      ? CheckStatus.DEGRADED
      : CheckStatus.SUCCESSFUL
}

export function print (text: string) {
  process.stdout.write(text)
}

export function printLn (text: string, afterLnCount = 1, beforeLnCount = 0) {
  process.stdout.write(`${'\n'.repeat(beforeLnCount)}${text}${'\n'.repeat(afterLnCount)}`)
}

export function getTestSessionUrl (testSessionId: string): string {
  const { baseURL, accountId } = getDefaults()
  return `${baseURL.replace(/api/, 'app')}/accounts/${accountId}/test-sessions/${testSessionId}`
}

export function getTraceUrl (traceUrl: string): string {
  return `https://trace.playwright.dev/?trace=${encodeURIComponent(traceUrl)}`
}

function formatHostPort (host: string, port?: number | null) {
  const prefix = isIPv6(host) ? `[${host}]` : host
  const suffix = port ? `:${port}` : ''
  return prefix + suffix
}
