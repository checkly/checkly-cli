import * as chalk from 'chalk'
import * as indentString from 'indent-string'
import { DateTime } from 'luxon'
import * as path from 'path'
import { Assertion } from '../constructs/api-check'

export enum CheckStatus {
  PENDING = 'pending',
  FAILED = 'failed',
  SUCCESSFUL = 'successful',
}

export function formatCheckTitle (status: CheckStatus, check: any) {
  const source = path.basename(check.sourceFile)
  let durationString = ''
  if (check.startedAt && check.stoppedAt) {
    const duration = DateTime.fromISO(check.stoppedAt)
      .diff(DateTime.fromISO(check.startedAt))
      .toHuman({ unitDisplay: 'narrow', listStyle: 'narrow' })
    durationString = `(${duration}) `
  }
  let title = `${status} ${durationString}> ${check.checkType.toLowerCase()} > ${source}`
  if (source !== check.name) {
    // For automatically generated Browser checks (.spec.js files), the source matches the name.
    // In this case, it looks nicer to only print the name once.
    title += `> ${check.name}`
  }
  if (status === CheckStatus.FAILED) {
    return chalk.bold.red(title)
  } else if (status === CheckStatus.PENDING) {
    return chalk.bold.magenta(title)
  } else {
    return chalk.bold.green(title)
  }
}

export function formatCheckResult (checkResult: any) {
  const result = []
  if (checkResult.checkType === 'API') {
    if (checkResult.checkRunData?.assertions?.length) {
      result.push(formatSectionTitle('Assertions'))
      result.push(formatAssertions(checkResult.checkRunData.assertions))
    }
    if (checkResult.checkRunData?.response) {
      result.push(formatSectionTitle('API Response'))
      result.push(formatApiResponse(checkResult.checkRunData.response))
    }
  }
  if (checkResult.logs?.length) {
    result.push(formatSectionTitle('Logs'))
    result.push(formatLogs(checkResult.logs))
  }
  return result.join('\n')
}

const assertionSources: any = {
  STATUS_CODE: 'status code',
  JSON_BODY: 'JSON body',
  HEADERS: 'headers',
  TEXT_BODY: 'text body',
  RESPONSE_TIME: 'response time',
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

function formatAssertions (assertions: Array<Assertion&{ error: string, actual: any }>) {
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
      })

      // TODO: Clean this up somehow
      // If the string is multiple lines, we print it on a new line
      if (truncatedActualLines <= 1) {
        actualString = `Received: ${truncatedActual}.`
      } else {
        actualString = `Received:\n${indentString(truncatedActual, 4, { indent: ' ' })}`
      }
    }
    const message = [
      'Checking that the',
      humanSource,
      property ? `property "${property}"` : undefined,
      regex ? `regex "${regex}"` : undefined,
      humanComparison,
      `target "${target}"`,
      assertionFailed ? 'failed.' : 'succeeded.',
      actualString,
    ].filter(Boolean).join(' ')
    return assertionFailed ? chalk.red(message) : chalk.green(message)
  }).join('\n')
}

function formatApiResponse (response: any) {
  const { truncated, result: stringBody } = truncate(response.body, {
    chars: 20 * 100,
    lines: 20,
    ending: chalk.magenta('\n...truncated...'),
  })
  return [
    `Received ${response.status} ${response.statusText}`,
    response.body ? 'With body:' : undefined,
    stringBody, // TODO: Write to a local file if truncated.
  ].filter(Boolean).join('\n')
}

export function formatLogs (logs: Array<{ level: string, msg: string, time: number }>) {
  return logs.flatMap(({ level, msg, time }) => {
    const timestamp = DateTime.fromMillis(time).toLocaleString(DateTime.TIME_WITH_SECONDS)
    let format = chalk.dim
    if (level === 'WARN') {
      format = chalk.dim.yellow
    } else if (level === 'ERROR') {
      format = chalk.dim.red
    }
    const [firstLine, ...remainingLines] = msg.split('\n')
    return [
      `${level}, ${timestamp}, ${format(firstLine)}`,
      ...remainingLines.map((line) => format(line)),
    ]
  }).join('\n')
}

function formatSectionTitle (title: string): string {
  const width = process.stdout.isTTY ? process.stdout.columns - 18 : 80
  return `──${chalk.bold(title)}${'─'.repeat(width - title.length)}`
}

export function truncate (val: any, opts: { chars?: number, lines?: number, ending?: string }) {
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

export function toString (val: any): string {
  if (typeof val === 'object') {
    return JSON.stringify(val, null, 2)
  } else {
    return val.toString()
  }
}
