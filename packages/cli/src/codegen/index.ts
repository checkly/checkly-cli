/**
 * `checkly/codegen`: generates `checkly/constructs` code from the resource
 * payloads an import plan carries, the code `checkly import` writes.
 *
 * Importing this entry has no side effects: it reads no configuration or
 * credentials and touches no disk, and generating code does neither.
 *
 * Unlike `checkly import`, it knows no project, so it accepts no resources
 * the project already declares (an import plan's `friends`): a reference to
 * a resource the generated code does not declare renders as `fromId()`.
 *
 * @experimental Intended for Checkly's own services. Its API is not covered
 * by semver guarantees until stated otherwise, and may change in any
 * release.
 */
export {
  generateConstructFiles,
  type GenerateChanges,
  type GeneratedConstructFile,
  type GenerateFailure,
  type GenerateOptions,
  type GenerateResource,
  type GenerateResult,
} from './generate.js'
export type { ProjectDefaults, ReferencedNames, ReferencedResourceType } from '../constructs/internal/codegen/index.js'
export { UnsupportedResourceTypeError } from '../constructs/construct-codegen.js'
export { ImportSafetyViolation } from '../constructs/internal/codegen/safety.js'
export { UnsupportedScriptError } from '../constructs/internal/codegen/snippet.js'
