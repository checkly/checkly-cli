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
 * `generateConstructDiff` renders a resource's drift (what changed in
 * Checkly since its last deploy) as a diff of the same generated code, from
 * the resource as it is now, the resource as its last deploy left it (in
 * the deploy payload's vocabulary) and the changes a deploy plan reports.
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
export {
  generateConstructDiff,
  type GenerateDiffChange,
  type GenerateDiffInput,
  type GenerateDiffLine,
  type GenerateDiffOptions,
  type GenerateDiffRedaction,
  type GenerateDiffReference,
  type GenerateDiffTextLine,
} from './diff.js'
export type { ProjectDefaults, ReferencedNames, ReferencedResourceType } from '../constructs/internal/codegen/index.js'
export { UnsupportedResourceTypeError } from '../constructs/construct-codegen.js'
export { ImportSafetyViolation } from '../constructs/internal/codegen/safety.js'
export { UnsupportedScriptError } from '../constructs/internal/codegen/snippet.js'
