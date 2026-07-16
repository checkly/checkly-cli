import { validate as validateUuid } from 'uuid'

import {
  DeprecatedPropertyDiagnostic,
  InvalidPropertyValueDiagnostic,
  RemovedPropertyDiagnostic,
  UnsupportedPropertyDiagnostic,
} from '../construct-diagnostics.js'
import { Diagnostics, Diagnostic } from '../diagnostics.js'
import { RetryStrategy } from '../retry-strategy.js'

type RetryStrategyProps = {
  doubleCheck?: boolean
  retryStrategy?: RetryStrategy
}

// eslint-disable-next-line require-await
async function validateDoubleCheck (
  diagnostics: Diagnostics,
  kind: new (property: string, error: Error) => Diagnostic,
  props: RetryStrategyProps,
): Promise<void> {
  if (props.doubleCheck !== undefined) {
    if (props.doubleCheck) {
      diagnostics.add(new kind(
        'doubleCheck',
        new Error(
          `To match the behavior of doubleCheck: true, please use the `
          + `following retryStrategy instead:`
          + `\n\n`
          + `  RetryStrategyBuilder.fixedStrategy({\n`
          + `    maxRetries: 1,\n`
          + `    baseBackoffSeconds: 0,\n`
          + `    maxDurationSeconds: 600,\n`
          + `    sameRegion: false,\n`
          + `  })`,
        ),
      ))
    } else {
      diagnostics.add(new kind(
        'doubleCheck',
        new Error(
          `To match the behavior of doubleCheck: false, please use the `
          + `following retryStrategy instead:`
          + `\n\n`
          + `  RetryStrategyBuilder.noRetries()`,
        ),
      ))
    }
  }
}

export async function validateDeprecatedDoubleCheck (diagnostics: Diagnostics, props: RetryStrategyProps) {
  if (props.doubleCheck !== undefined) {
    if (props.retryStrategy) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'doubleCheck',
        new Error('Cannot specify both "doubleCheck" and "retryStrategy".'),
      ))
    }

    await validateDoubleCheck(diagnostics, DeprecatedPropertyDiagnostic, props)
  }
}

export async function validateRemovedDoubleCheck (diagnostics: Diagnostics, props: RetryStrategyProps) {
  await validateDoubleCheck(diagnostics, RemovedPropertyDiagnostic, props)
}

export async function validateUnsupportedDoubleCheck (diagnostics: Diagnostics, props: RetryStrategyProps) {
  await validateDoubleCheck(diagnostics, UnsupportedPropertyDiagnostic, props)
}

// eslint-disable-next-line require-await
export async function validatePhysicalIdIsNumeric (
  diagnostics: Diagnostics,
  constructName: string,
  physicalId: string | number | undefined,
): Promise<void> {
  if (physicalId === undefined) {
    diagnostics.add(new InvalidPropertyValueDiagnostic(
      'physicalId',
      new Error('Value is required.'),
    ))
    return
  }
  if (typeof physicalId !== 'number') {
    diagnostics.add(new InvalidPropertyValueDiagnostic(
      'physicalId',
      new Error(
        `Value must be a number.`
        + `\n\n`
        + `Hint: When calling ${constructName}.fromId(), make sure the value you pass in is a number.`,
      ),
    ))
  }
}

// eslint-disable-next-line require-await
export async function validatePhysicalIdIsUuid (
  diagnostics: Diagnostics,
  constructName: string,
  physicalId: string | number | undefined,
): Promise<void> {
  if (physicalId === undefined) {
    diagnostics.add(new InvalidPropertyValueDiagnostic(
      'physicalId',
      new Error('Value is required.'),
    ))
    return
  }
  if (!validateUuid(String(physicalId))) {
    diagnostics.add(new InvalidPropertyValueDiagnostic(
      'physicalId',
      new Error(
        `Value must be a valid UUID.`
        + `\n\n`
        + `Hint: When calling ${constructName}.fromId(), make sure the value you pass in is a valid UUID.`,
      ),
    ))
  }
}

type ResponseTimeProps = {
  degradedResponseTime?: number
  maxResponseTime?: number
}

type ResponseTimeLimits = {
  degradedResponseTime: number
  maxResponseTime: number
  // The per-type default that the backend applies to `maxResponseTime` when the
  // caller omits it. Used so the degraded <= max cross-check still runs (against
  // the effective max) when only `degradedResponseTime` is set explicitly.
  defaultMaxResponseTime?: number
}

// eslint-disable-next-line require-await
export async function validateResponseTimes (
  diagnostics: Diagnostics,
  props: ResponseTimeProps,
  limits: ResponseTimeLimits,
): Promise<void> {
  if (props.degradedResponseTime !== undefined) {
    const value = props.degradedResponseTime
    const limit = limits.degradedResponseTime
    if (value > limit) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'degradedResponseTime',
        new Error(
          `The value of "degradedResponseTime" must be ${limit} or lower.`
          + `\n\n`
          + `The current value is ${value}.`,
        ),
      ))
    }
  }

  if (props.maxResponseTime !== undefined) {
    const value = props.maxResponseTime
    const limit = limits.maxResponseTime
    if (value > limit) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'maxResponseTime',
        new Error(
          `The value of "maxResponseTime" must be ${limit} or lower.`
          + `\n\n`
          + `The current value is ${value}.`,
        ),
      ))
    }
  }

  // When `maxResponseTime` is omitted the backend applies a per-type default, so
  // compare `degradedResponseTime` against that effective max. This catches the
  // case where an explicit degraded value exceeds the default max (which would
  // otherwise pass CLI validation but produce a broken check server-side).
  const effectiveMaxResponseTime = props.maxResponseTime ?? limits.defaultMaxResponseTime
  if (
    props.degradedResponseTime !== undefined
    && effectiveMaxResponseTime !== undefined
    && props.degradedResponseTime > effectiveMaxResponseTime
  ) {
    diagnostics.add(new InvalidPropertyValueDiagnostic(
      'degradedResponseTime',
      new Error(
        props.maxResponseTime !== undefined
          ? `The value of "degradedResponseTime" must be less than or equal to "maxResponseTime".`
          : `The value of "degradedResponseTime" must be less than or equal to the default `
            + `"maxResponseTime" of ${effectiveMaxResponseTime}. Set an explicit "maxResponseTime" `
            + `if you need a higher limit.`,
      ),
    ))
  }
}
