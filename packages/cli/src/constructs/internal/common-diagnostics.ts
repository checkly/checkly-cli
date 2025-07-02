import { DeprecatedPropertyDiagnostic, InvalidPropertyValueDiagnostic, RemovedPropertyDiagnostic } from '../construct-diagnostics'
import { Diagnostics, Diagnostic } from '../diagnostics'
import { RetryStrategy } from '../retry-strategy'

type RetryStrategyProps = {
  doubleCheck?: boolean
  retryStrategy?: RetryStrategy
}

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
          `To match the behavior of doubleCheck: true, please use the ` +
          `following retryStrategy instead:` +
          `\n\n` +
          `  RetryStrategyBuilder.fixedStrategy({\n` +
          `    maxRetries: 1,\n` +
          `    baseBackoffSeconds: 0,\n`+
          `    maxDurationSeconds: 600,\n` +
          `    sameRegion: false,\n` +
          `  })`,
        ),
      ))
    } else {
      diagnostics.add(new kind(
        'doubleCheck',
        new Error(
          `To match the behavior of doubleCheck: false, please use the ` +
          `following retryStrategy instead:` +
          `\n\n` +
          `  RetryStrategyBuilder.noRetries()`,
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
