import { InvalidPropertyValueDiagnostic } from '../construct-diagnostics.js'
import { Diagnostics } from '../diagnostics.js'

// Shared helpers for the per-monitor assertion validators. Assertion fields are
// declared as plain strings, so an assertion written as an object literal bypasses
// the builder and is type-legal; these helpers report the source/property/comparison
// pairings the deploy schema would reject with a 400.

// Formats the keys of a lookup record as a quoted, comma-separated list for an
// "Expected one of ..." message.
export function quotedKeys (values: Record<string, unknown>): string {
  return Object.keys(values).map(value => `"${value}"`).join(', ')
}

// Reports an invalid assertion as a fatal diagnostic. The property path is the array
// field itself; the offending element index and detail go in the message, following
// the convention in agentic-check.ts.
export function addAssertionDiagnostic (diagnostics: Diagnostics, message: string): void {
  diagnostics.add(new InvalidPropertyValueDiagnostic('request.assertions', new Error(message)))
}
