import { validate as validateUuid } from 'uuid'

import {
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
  property = 'doubleCheck',
): Promise<void> {
  if (props.doubleCheck !== undefined) {
    if (props.doubleCheck) {
      diagnostics.add(new kind(
        property,
        new Error(
          `To match the behavior of doubleCheck: true, please use the `
          + `following retryStrategy instead:`
          + `\n\n`
          + `  RetryStrategyBuilder.singleRetry({\n`
          + `    baseBackoffSeconds: 0,\n`
          + `    sameRegion: false,\n`
          + `  })`,
        ),
      ))
    } else {
      diagnostics.add(new kind(
        property,
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

export async function validateRemovedDoubleCheck (
  diagnostics: Diagnostics,
  props: RetryStrategyProps,
  property?: string,
) {
  await validateDoubleCheck(diagnostics, RemovedPropertyDiagnostic, props, property)
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

export type ResponseTimeLimits = {
  degradedResponseTime: number
  maxResponseTime: number
  // The per-type defaults that the backend applies when the caller omits a
  // value. Used so the degraded <= max cross-check still runs (against the
  // effective values) when only one of the two is set explicitly.
  defaultDegradedResponseTime?: number
  defaultMaxResponseTime?: number
  // Whether a `maxResponseTime` of 0 means "never fail on latency", in which
  // case there is nothing to order `degradedResponseTime` against.
  zeroMaxResponseTimeDisablesFailure?: boolean
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

  // When a value is omitted the backend applies a per-type default, so compare
  // against the effective values. This catches an explicit value on one side
  // that conflicts with the default on the other (which would otherwise pass
  // CLI validation but be rejected or produce a broken check server-side).
  const effectiveDegradedResponseTime = props.degradedResponseTime ?? limits.defaultDegradedResponseTime
  const effectiveMaxResponseTime = props.maxResponseTime ?? limits.defaultMaxResponseTime
  if (
    effectiveDegradedResponseTime === undefined
    || effectiveMaxResponseTime === undefined
    || effectiveDegradedResponseTime <= effectiveMaxResponseTime
    || (limits.zeroMaxResponseTimeDisablesFailure && effectiveMaxResponseTime === 0)
  ) {
    return
  }

  if (props.degradedResponseTime === undefined) {
    diagnostics.add(new InvalidPropertyValueDiagnostic(
      'maxResponseTime',
      new Error(
        `The value of "maxResponseTime" must be greater than or equal to the default `
        + `"degradedResponseTime" of ${effectiveDegradedResponseTime}. Set an explicit `
        + `"degradedResponseTime" if you need a lower limit.`,
      ),
    ))
    return
  }

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
