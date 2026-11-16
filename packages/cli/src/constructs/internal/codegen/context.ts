import path, { dirname } from 'node:path'

import { CaseFormat, GeneratedFile, IdentifierValue, cased } from '../../../sourcegen/index.js'
import { ProgramFile, StaticAuxiliaryFile } from '../../../sourcegen/program.js'
import { isSafeSnippetFilename, parseSnippetDependencies } from './snippet.js'
import type { ConstructExport } from '../../session.js'
import type { CheckConfigDefaults } from '../../../services/checkly-config-loader.js'
import type { FriendResourceSync } from '../../../rest/projects.js'

export class MissingContextVariableMappingError extends Error {}

export abstract class VariableLocator {
  id: IdentifierValue
  filePath: string

  constructor (id: IdentifierValue, filePath: string) {
    this.id = id
    this.filePath = filePath
  }
}

export class GeneratedVariableLocator extends VariableLocator {
  file: GeneratedFile

  constructor (id: IdentifierValue, file: GeneratedFile) {
    super(id, file.path)
    this.file = file
  }
}

export class FriendVariableLocator extends VariableLocator {
}

const CHECKLY_IMPORT_FILENAME_TAG_PREFIX = 'checkly-import-filename:'

export interface FilenameOptions {
  tags?: string[]
  isolate?: boolean
  unique?: boolean
  contentKey?: string
  case?: CaseFormat
}

/**
 * A file name taken from a resource's tag, with `/` separators, or
 * `undefined` if it would not stay below the directory it is joined to. It
 * may name subdirectories (`team/orders`), but not an absolute path (`/x`,
 * `C:x`, `\\server\share`), a `..` segment, an empty segment, or a NUL.
 */
function relativeFilename (name: string): string | undefined {
  const normalized = name.replace(/\\/g, '/')
  if (normalized.includes('\0') || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return undefined
  }
  const segments = normalized.split('/')
  if (segments.some(segment => segment === '' || segment === '..')) {
    return undefined
  }
  return normalized
}

const splitExt = (filePath: string): [string, string] => {
  const { dir, base } = path.parse(filePath)
  // Remove all extensions even if there are multiple.
  const index = base.indexOf('.')
  return index !== -1
    ? [path.join(dir, base.slice(0, index)), base.slice(index)]
    : [filePath, '']
}

export class FilePath {
  fullPath: string

  constructor (fullPath: string) {
    this.fullPath = fullPath
  }

  get extless (): string {
    const [value] = splitExt(this.fullPath)
    return value
  }
}

/**
 * Creates a usable variable name from a fixed base component and a variable
 * name component.
 *
 * In order to keep variable names short and sensible, the base component
 * may or may not be included in the final result if its value is deemed
 * redundant.
 *
 * @example
 * formatVariable('group', 'Website Group') === 'websiteGroup'
 * formatVariable('group', 'Production') === 'productionGroup'
 * formatVariable('alert', 'ops email') === 'opsEmailAlert'
 * formatVariable('location', 'Office Rack #12') === 'officeRack12Location'
 * @param base Fixed base component
 * @param name Variable component
 * @returns Formatted variable name
 */
function formatVariable (base: string, name: string): string {
  let prefix = cased(name, 'camelCase')

  // Even camelcased, the prefix may start with a number. Get rid of it.
  if (/^[0-9]+/.test(prefix)) {
    prefix = prefix.replace(/^[0-9]+/, '')
    prefix = cased(prefix, 'camelCase')
  }

  // Allow pretty long variables but set a hard limit. Limit does not include
  // the suffix.
  if (prefix.length > 64) {
    prefix = prefix.slice(0, 64)
  }

  // The name might consist of characters that all get stripped out. If so,
  // just use the base.
  if (prefix === '') {
    return cased(base, 'camelCase')
  }

  // Maybe the resource name already starts with the base. Can happen if the
  // resource name is "Group #123" and base is "group", which would result in
  // "group123Group" if the normal suffix was added. Instead, don't add the
  // suffix.
  if (prefix.startsWith(base)) {
    return prefix
  }

  const suffix = cased(base, 'PascalCase')

  // Maybe the resource name already includes the base. For example,
  // if the resource name is "My Group" and the base "group", that would
  // then result in "myGroupGroup" which is weird. If so skip the suffix.
  if (prefix.endsWith(suffix)) {
    return prefix
  }

  return prefix + suffix
}

/**
 * The name a registered construct's variable gets: a resource name to derive
 * an identifier from, or an identifier to use as it is, such as the name the
 * construct already has in the user's code.
 */
export type VariableName = string | { identifier: string }

function variableFor (base: string, name: VariableName): string {
  return typeof name === 'string' ? formatVariable(base, name) : name.identifier
}

/**
 * What a masked value prints as: never an empty string, which could pass for
 * a value. Only a string the preview itself wrote (`ContextOptions.maskedValues`)
 * is ever printed back for a secret; a value that merely looks masked is not.
 */
export const MASKED_VALUE = '********'

export interface ContextOptions {
  /**
   * Set by the deploy preview's renderer, never by an import: the exact
   * strings the preview wrote over masked values. A `secret: true` variable
   * then prints such a value as a string literal beside `secret: true`,
   * instead of a generated `secret()` reference, so the two sides of a
   * preview can differ where the secret moved. Any other value prints as the
   * plain mask, never as itself.
   */
  maskedValues?: ReadonlySet<string>
  /**
   * Set when the code being rendered already exists (a deploy preview, the
   * write-back), never by an import: the properties that code spells out,
   * as dotted paths from the construct's options (`muted`,
   * `request.skipSSL`, `retryStrategy.maxRetries`, and for a list element
   * with a literal key, `headers[Authorization].locked`, the key taken as
   * it is). A codegen writes
   * such a property even when its value is the default it would otherwise
   * leave out, so that a property the author wrote down does not vanish
   * from a rendering, or read as added or removed in a diff, because its
   * value happens to be the default.
   */
  spelledOut?: ReadonlySet<string>
  /**
   * The `checks` defaults of the project the generated code will live in,
   * which a generated check falls back to for a property it leaves out (see
   * `projectDefaultsFor` in `check-codegen.ts`). `{}` stands for a project
   * that sets none, where an omitted property means the backend default.
   *
   * Absent, the project is unknown, so a codegen cannot tell which omissions
   * are safe: every check property a project default could fill in is then
   * written out even at its default value, and an empty relation or variable
   * list is written as `[]`.
   */
  projectDefaults?: ProjectDefaults
  /**
   * The names of resources a generated construct refers to by ID because the
   * code being generated does not declare them, keyed by resource type and
   * then by physical ID (as a string). A `fromId()` reference to a named
   * resource carries the name in a trailing comment, so that a reader can
   * tell what the ID stands for.
   */
  referencedNames?: ReferencedNames
}

/**
 * The project-level check defaults of a `checkly.config`: the shared `checks`
 * section and the sections for browser and multi-step checks.
 */
export interface ProjectDefaults {
  checks?: CheckConfigDefaults
  browserChecks?: CheckConfigDefaults
  multiStepChecks?: CheckConfigDefaults
}

/**
 * The resource types a generated construct can refer to with `fromId()`: the
 * same types an import plan can name as friends.
 */
export type ReferencedResourceType = FriendResourceSync['type']

export type ReferencedNames = Partial<Record<ReferencedResourceType, Readonly<Record<string, string>>>>

/**
 * The child keys under a prefix among dotted paths: `retryStrategy` picks
 * `maxRetries` out of `retryStrategy.maxRetries`. A bracketed element key
 * (`headers[x.trace].locked`) is opaque: the dots inside it do not separate
 * segments, so `request` has the child `headers[x.trace]`.
 */
export function pathsUnder (paths: ReadonlySet<string>, prefix: string): string[] {
  const children: string[] = []
  for (const path of paths) {
    if (!path.startsWith(`${prefix}.`)) {
      continue
    }
    const rest = path.slice(prefix.length + 1)
    let end = 0
    let depth = 0
    while (end < rest.length && (depth > 0 || rest[end] !== '.')) {
      depth += rest[end] === '[' ? 1 : rest[end] === ']' ? -1 : 0
      end += 1
    }
    const child = rest.slice(0, end)
    if (!children.includes(child)) {
      children.push(child)
    }
  }
  return children
}

function snippetFilenameCase (name: string): CaseFormat {
  return isSafeSnippetFilename(name) ? 'identity' : 'kebab-case'
}

/**
 * For each file `content` requires as a snippet, the names a snippet file
 * may be registered under for it: with or without an extension.
 */
function requiredSnippetCandidates (content: string, sameFolder: boolean): string[][] {
  return parseSnippetDependencies(content, sameFolder ? './' : undefined).map(filename => {
    const { name } = path.parse(filename)
    return [
      name,
      filename,
      `${name}.ts`,
      `${name}.js`,
      `${filename}.ts`,
      `${filename}.js`,
    ]
  })
}

export class Context {
  readonly maskedValues: ReadonlySet<string> | undefined
  readonly #spelledOut: ReadonlySet<string>
  /** See `ContextOptions.projectDefaults`; `undefined` when the project is unknown. */
  readonly projectDefaults: ProjectDefaults | undefined
  readonly #referencedNames: ReferencedNames

  constructor (options: ContextOptions = {}) {
    this.maskedValues = options.maskedValues
    this.#spelledOut = options.spelledOut ?? new Set()
    this.projectDefaults = options.projectDefaults
    this.#referencedNames = options.referencedNames ?? {}
  }

  /** The name of a resource referenced by ID, if known (see `ContextOptions.referencedNames`). */
  referencedName (type: ReferencedResourceType, physicalId: string | number): string | undefined {
    const names = this.#referencedNames[type]
    const key = String(physicalId)
    return names !== undefined && Object.hasOwn(names, key) ? names[key] : undefined
  }

  /** Whether the code being rendered spells out the property at `path` (see `ContextOptions.spelledOut`). */
  spelledOut (path: string): boolean {
    return this.#spelledOut.has(path)
  }

  /** The spelled-out properties directly under `prefix`, for a codegen that takes a list rather than a context. */
  spelledOutUnder (prefix: string): string[] {
    return pathsUnder(this.#spelledOut, prefix)
  }

  /**
   * Whether a value is one of the stand-ins the preview wrote over a secret.
   * Such a value is unknown to the codegen: it is never parsed for a
   * credential inside it and never held against an import-safety rule.
   * Where a codegen would derive a prop from the real value, it prints the
   * stand-in as that prop instead, so the preview shows the mask, and its
   * change note, in the prop's place. Under an import no value is ever
   * masked.
   */
  isMasked (value: unknown): boolean {
    return typeof value === 'string' && this.maskedValues !== undefined && this.maskedValues.has(value)
  }

  #alertChannelVariablesByPhysicalId = new Map<number, GeneratedVariableLocator>()
  #alertChannelFriendVariablesByPhysicalId = new Map<number, FriendVariableLocator>()

  #checkAlertChannelPhysicalIdsByPhysicalId = new Map<string, number[]>()
  #checkPrivateLocationPhysicalIdsByPhysicalId = new Map<string, string[]>()

  #checkGroupAlertChannelPhysicalIdsByPhysicalId = new Map<number, number[]>()
  #checkGroupPrivateLocationPhysicalIdsByPhysicalId = new Map<number, string[]>()
  #checkGroupVariablesByPhysicalId = new Map<number, GeneratedVariableLocator>()
  #checkGroupFriendVariablesByPhysicalId = new Map<number, FriendVariableLocator>()

  #privateLocationVariablesByPhysicalId = new Map<string, GeneratedVariableLocator>()
  #privateLocationFriendVariablesByPhysicalId = new Map<string, FriendVariableLocator>()

  #statusPageServiceVariablesByPhysicalId = new Map<string, GeneratedVariableLocator>()
  #statusPageServiceFriendVariablesByPhysicalId = new Map<string, FriendVariableLocator>()

  #statusPageVariablesByPhysicalId = new Map<string, GeneratedVariableLocator>()
  #statusPageFriendVariablesByPhysicalId = new Map<string, FriendVariableLocator>()

  #statusPageComponentVariablesByPhysicalId = new Map<string, GeneratedVariableLocator>()
  #statusPageComponentFriendVariablesByPhysicalId = new Map<string, FriendVariableLocator>()

  #knownSecrets = new Set<string>()

  #knownFilePaths = new Map<string, number>()
  #filePathContentKeys = new Map<string, string>()

  #auxiliarySnippetFilesByPhysicalId = new Map<number, ProgramFile>()
  #auxiliarySnippetFilesByFilename = new Map<string, ProgramFile>()
  #usedAuxiliarySnippetFiles = new Set<ProgramFile>()
  #refusedSnippetsByPhysicalId = new Map<number, Error>()
  #refusedSnippetsByFilename = new Map<string, Error>()

  #reservedIdentifiersByFilePath = new Map<string, Map<string, VariableLocator>>()

  #reserveIdentifierForLocator (
    filePath: string,
    locator: VariableLocator,
  ): IdentifierValue {
    const fileVariables = this.#reservedIdentifiersByFilePath.get(filePath)
      ?? new Map<string, VariableLocator>()

    this.#reservedIdentifiersByFilePath.set(filePath, fileVariables)

    const name = locator.id.value

    // First use? Let it through.
    const existingLocator = fileVariables.get(name)
    if (existingLocator === undefined) {
      fileVariables.set(name, locator)
      return locator.id
    }

    // If we're reserving an identifier for the same locator as earlier, let
    // it through. The same identifier will work for our purposes.
    if (existingLocator === locator) {
      return locator.id
    }

    // Nth use? Try to find the next available number, keeping in mind the
    // possibility that someone may have separately reserved a variable with
    // the same counter value at the end, which can happen if the base
    // variable name includes a number.
    //
    // Starts counting from 2 (first use has no counter appended).
    for (let nth = 2; ; nth += 1) {
      const newName = `${name}${nth}`

      const existingLocator = fileVariables.get(newName)
      if (existingLocator === undefined) {
        fileVariables.set(newName, locator)
        return new IdentifierValue(newName)
      }

      if (existingLocator === locator) {
        return new IdentifierValue(newName)
      }
    }
  }

  filePath (parent: string, hint: string, options?: FilenameOptions): FilePath {
    let filename = cased(hint, options?.case ?? 'kebab-case')

    if (options?.tags !== undefined) {
      for (const tag of options.tags) {
        if (tag.startsWith(CHECKLY_IMPORT_FILENAME_TAG_PREFIX)) {
          // A name that would leave `parent` is ignored, and the file is
          // named after the hint instead.
          const tagged = relativeFilename(tag.slice(CHECKLY_IMPORT_FILENAME_TAG_PREFIX.length))
          if (tagged !== undefined) {
            filename = tagged
          }
          break
        }
      }
    }

    const [base, ext] = splitExt(filename)

    const parts = [parent]
    if (options?.isolate) {
      parts.push(base)
    }

    parts.push(filename)

    let candidate = path.join(...parts)

    do {
      let counter = this.#knownFilePaths.get(candidate) ?? 0

      let satisfied = true

      // If we wanted a unique match and this isn't the first time we've seen
      // the candidate, we're not satisfied.
      if (counter !== 0 && options?.unique) {
        satisfied = false
      }

      // A content key attempts to differentiate between files based on a
      // representative value of their contents. If we've previously found
      // the candidate path but it had a different content key, we're
      // not satisfied, even if a unique match was not requested.
      if (options?.contentKey !== undefined) {
        const currentKey = this.#filePathContentKeys.get(candidate)
        if (currentKey !== undefined) {
          if (currentKey !== options.contentKey) {
            satisfied = false
          }
        } else {
          this.#filePathContentKeys.set(candidate, options.contentKey)
        }
      }

      if (!satisfied || counter === 0) {
        counter += 1
      }

      this.#knownFilePaths.set(candidate, counter)

      if (satisfied) {
        return new FilePath(candidate)
      }

      parts.pop()

      const nthBase = base + '-' + counter

      if (options?.isolate) {
        parts.pop()
        parts.push(nthBase)
      }

      parts.push(nthBase + ext)

      candidate = path.join(...parts)
    // eslint-disable-next-line no-constant-condition
    } while (true)
  }

  importVariable (locator: GeneratedVariableLocator, file: GeneratedFile): IdentifierValue {
    const reservedVariable = this.#reserveIdentifierForLocator(file.path, locator)

    file.namedImport(locator.id.value, locator.file.path, {
      relativeTo: dirname(file.path),
      alias: reservedVariable === locator.id ? undefined : reservedVariable.value,
    })

    return reservedVariable
  }

  importFriendVariable (locator: FriendVariableLocator, file: GeneratedFile): IdentifierValue {
    const reservedVariable = this.#reserveIdentifierForLocator(file.path, locator)

    file.namedImport(locator.id.value, locator.filePath, {
      relativeTo: dirname(file.path),
      alias: reservedVariable === locator.id ? undefined : reservedVariable.value,
    })

    return reservedVariable
  }

  /**
   * Give up the identifier reserved for a registered variable, for a caller
   * about to register the same construct again under another name: the new
   * name is then free to be the one the old registration held.
   */
  releaseVariable (locator: GeneratedVariableLocator): void {
    const reserved = this.#reservedIdentifiersByFilePath.get(locator.file.path)
    if (reserved?.get(locator.id.value) === locator) {
      reserved.delete(locator.id.value)
    }
  }

  registerCheckGroup (physicalId: number, name: VariableName, file: GeneratedFile): GeneratedVariableLocator {
    const preferredId = new IdentifierValue(variableFor('group', name))
    const locator = new GeneratedVariableLocator(preferredId, file)
    locator.id = this.#reserveIdentifierForLocator(file.path, locator)
    this.#checkGroupVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupCheckGroup (physicalId: number): GeneratedVariableLocator {
    const locator = this.#checkGroupVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerFriendCheckGroup (physicalId: number, friend: ConstructExport): FriendVariableLocator {
    const id = new IdentifierValue(friend.exportName)
    const locator = new FriendVariableLocator(id, friend.filePath)
    this.#checkGroupFriendVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupFriendCheckGroup (physicalId: number): FriendVariableLocator {
    const locator = this.#checkGroupFriendVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerAlertChannel (physicalId: number, name: VariableName, file: GeneratedFile): GeneratedVariableLocator {
    const preferredId = new IdentifierValue(variableFor('alert', name))
    const locator = new GeneratedVariableLocator(preferredId, file)
    locator.id = this.#reserveIdentifierForLocator(file.path, locator)
    this.#alertChannelVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupAlertChannel (physicalId: number): GeneratedVariableLocator {
    const locator = this.#alertChannelVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerFriendAlertChannel (physicalId: number, friend: ConstructExport): FriendVariableLocator {
    const id = new IdentifierValue(friend.exportName)
    const locator = new FriendVariableLocator(id, friend.filePath)
    this.#alertChannelFriendVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupFriendAlertChannel (physicalId: number): FriendVariableLocator {
    const locator = this.#alertChannelFriendVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerPrivateLocation (physicalId: string, name: VariableName, file: GeneratedFile): GeneratedVariableLocator {
    const preferredId = new IdentifierValue(variableFor('location', name))
    const locator = new GeneratedVariableLocator(preferredId, file)
    locator.id = this.#reserveIdentifierForLocator(file.path, locator)
    this.#privateLocationVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupPrivateLocation (physicalId: string): GeneratedVariableLocator {
    const locator = this.#privateLocationVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerFriendPrivateLocation (physicalId: string, friend: ConstructExport): FriendVariableLocator {
    const id = new IdentifierValue(friend.exportName)
    const locator = new FriendVariableLocator(id, friend.filePath)
    this.#privateLocationFriendVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupFriendPrivateLocation (physicalId: string): FriendVariableLocator {
    const locator = this.#privateLocationFriendVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerPrivateLocationGroupAssignment (privateLocationPhysicalId: string, groupPhysicalId: number) {
    const all = this.#checkGroupPrivateLocationPhysicalIdsByPhysicalId.get(groupPhysicalId) ?? []
    all.push(privateLocationPhysicalId)

    this.#checkGroupPrivateLocationPhysicalIdsByPhysicalId.set(groupPhysicalId, all)
  }

  lookupCheckGroupPrivateLocations (groupPhysicalId: number): string[] {
    const ids = this.#checkGroupPrivateLocationPhysicalIdsByPhysicalId.get(groupPhysicalId)
    if (ids === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return ids
  }

  registerPrivateLocationCheckAssignment (privateLocationPhysicalId: string, checkPhysicalId: string) {
    const all = this.#checkPrivateLocationPhysicalIdsByPhysicalId.get(checkPhysicalId) ?? []
    all.push(privateLocationPhysicalId)

    this.#checkPrivateLocationPhysicalIdsByPhysicalId.set(checkPhysicalId, all)
  }

  lookupCheckPrivateLocations (checkPhysicalId: string): string[] {
    const ids = this.#checkPrivateLocationPhysicalIdsByPhysicalId.get(checkPhysicalId)
    if (ids === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return ids
  }

  registerAlertChannelCheckSubscription (alertChannelPhysicalId: number, checkPhysicalId: string) {
    const all = this.#checkAlertChannelPhysicalIdsByPhysicalId.get(checkPhysicalId) ?? []
    all.push(alertChannelPhysicalId)

    this.#checkAlertChannelPhysicalIdsByPhysicalId.set(checkPhysicalId, all)
  }

  lookupCheckAlertChannels (checkPhysicalId: string): number[] {
    const ids = this.#checkAlertChannelPhysicalIdsByPhysicalId.get(checkPhysicalId)
    if (ids === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return ids
  }

  registerAlertChannelGroupSubscription (alertChannelPhysicalId: number, groupPhysicalId: number) {
    const all = this.#checkGroupAlertChannelPhysicalIdsByPhysicalId.get(groupPhysicalId) ?? []
    all.push(alertChannelPhysicalId)

    this.#checkGroupAlertChannelPhysicalIdsByPhysicalId.set(groupPhysicalId, all)
  }

  lookupCheckGroupAlertChannels (groupPhysicalId: number): number[] {
    const ids = this.#checkGroupAlertChannelPhysicalIdsByPhysicalId.get(groupPhysicalId)
    if (ids === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return ids
  }

  registerStatusPageService (physicalId: string, name: VariableName, file: GeneratedFile): GeneratedVariableLocator {
    const preferredId = new IdentifierValue(variableFor('service', name))
    const locator = new GeneratedVariableLocator(preferredId, file)
    locator.id = this.#reserveIdentifierForLocator(file.path, locator)
    this.#statusPageServiceVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupStatusPageService (physicalId: string): GeneratedVariableLocator {
    const locator = this.#statusPageServiceVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerFriendStatusPageService (physicalId: string, friend: ConstructExport): FriendVariableLocator {
    const id = new IdentifierValue(friend.exportName)
    const locator = new FriendVariableLocator(id, friend.filePath)
    this.#statusPageServiceFriendVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupFriendStatusPageService (physicalId: string): FriendVariableLocator {
    const locator = this.#statusPageServiceFriendVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerStatusPage (physicalId: string, name: VariableName, file: GeneratedFile): GeneratedVariableLocator {
    const preferredId = new IdentifierValue(variableFor('page', name))
    const locator = new GeneratedVariableLocator(preferredId, file)
    locator.id = this.#reserveIdentifierForLocator(file.path, locator)
    this.#statusPageVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupStatusPage (physicalId: string): GeneratedVariableLocator {
    const locator = this.#statusPageVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerFriendStatusPage (physicalId: string, friend: ConstructExport): FriendVariableLocator {
    const id = new IdentifierValue(friend.exportName)
    const locator = new FriendVariableLocator(id, friend.filePath)
    this.#statusPageFriendVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupFriendStatusPage (physicalId: string): FriendVariableLocator {
    const locator = this.#statusPageFriendVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerStatusPageComponent (physicalId: string, name: VariableName, file: GeneratedFile): GeneratedVariableLocator {
    const preferredId = new IdentifierValue(variableFor('component', name))
    const locator = new GeneratedVariableLocator(preferredId, file)
    locator.id = this.#reserveIdentifierForLocator(file.path, locator)
    this.#statusPageComponentVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupStatusPageComponent (physicalId: string): GeneratedVariableLocator {
    const locator = this.#statusPageComponentVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerFriendStatusPageComponent (physicalId: string, friend: ConstructExport): FriendVariableLocator {
    const id = new IdentifierValue(friend.exportName)
    const locator = new FriendVariableLocator(id, friend.filePath)
    this.#statusPageComponentFriendVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupFriendStatusPageComponent (physicalId: string): FriendVariableLocator {
    const locator = this.#statusPageComponentFriendVariablesByPhysicalId.get(physicalId)
    if (locator === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return locator
  }

  registerKnownSecret (name: string): boolean {
    if (this.#knownSecrets.has(name)) {
      return false
    }

    this.#knownSecrets.add(name)
    return true
  }

  registerAuxiliarySnippetFile (physicalId: number, snippetFile: ProgramFile) {
    this.#auxiliarySnippetFilesByPhysicalId.set(physicalId, snippetFile)
    this.#auxiliarySnippetFilesByFilename.set(snippetFile.basename, snippetFile)
  }

  /**
   * The snippet file a script names by ID. Recorded as used by the generated
   * code (`usedAuxiliarySnippetFiles`).
   *
   * @throws Error if the snippet, or a snippet it reaches, was refused
   * (`registerRefusedSnippet`).
   */
  lookupAuxiliarySnippetFile (physicalId: number): ProgramFile | undefined {
    const refused = this.#refusedSnippetsByPhysicalId.get(physicalId)
    if (refused !== undefined) {
      throw refused
    }
    const file = this.#auxiliarySnippetFilesByPhysicalId.get(physicalId)
    if (file !== undefined) {
      this.#useSnippetFile(file)
    }
    return file
  }

  /**
   * The snippet files a check's script requires through `./snippets/`.
   * Recorded as used by the generated code (`usedAuxiliarySnippetFiles`).
   *
   * @throws Error if the script, or a snippet it reaches, requires a refused
   * snippet (`registerRefusedSnippet`).
   */
  findScriptSnippetFiles (content: string): ProgramFile[] {
    this.#throwIfRequiresRefused(content, false)
    const files = this.snippetFilesRequiredBy(content)
    for (const file of files) {
      this.#useSnippetFile(file)
    }
    return files
  }

  /**
   * The snippet files `content` requires, without recording them as used:
   * through `./snippets/` only, or with `sameFolder` also as a sibling
   * (`./other-snippet`), which is how a snippet that is itself required may
   * require another.
   */
  snippetFilesRequiredBy (content: string, options?: { sameFolder?: boolean }): ProgramFile[] {
    const files = new Set<ProgramFile>()
    for (const candidates of requiredSnippetCandidates(content, options?.sameFolder ?? false)) {
      for (const candidate of candidates) {
        const match = this.#auxiliarySnippetFilesByFilename.get(candidate)
        if (match !== undefined) {
          files.add(match)
          break
        }
      }
    }
    return [...files]
  }

  /**
   * Remembers a snippet the codegen cannot convert, instead of failing every
   * resource for it: only a resource that names it by ID, or whose script
   * reaches it through requires, fails, with `cause` as the reason.
   *
   * @param name The snippet's name, by which a script requires it (see
   * `snippetFilename`); absent if it has none.
   */
  registerRefusedSnippet (physicalId: number, name: string | undefined, cause: Error) {
    const refused = new Error(`Snippet #${physicalId} cannot be converted: ${cause.message}`, { cause })
    this.#refusedSnippetsByPhysicalId.set(physicalId, refused)
    if (name !== undefined) {
      this.#refusedSnippetsByFilename.set(this.snippetFilename(name), refused)
    }
  }

  /**
   * The path of a snippet's file: `snippets/<name>`, the name kept as it is
   * when it is one the backend allows in a file name (`isSafeSnippetFilename`),
   * else in kebab-case. Snippets with the same name but different IDs get
   * numbered paths.
   */
  snippetFilePath (physicalId: number, name: string): FilePath {
    return this.filePath('snippets', name, {
      unique: false,
      contentKey: `snippet::${physicalId}`,
      case: snippetFilenameCase(name),
    })
  }

  /**
   * The file name, without an extension, that a snippet's file is named
   * after (see `snippetFilePath`), by which a script requires it.
   */
  snippetFilename (name: string): string {
    return cased(name, snippetFilenameCase(name))
  }

  // A used snippet counts only once nothing it reaches is refused.
  #useSnippetFile (file: ProgramFile) {
    if (this.#refusedSnippetsByFilename.size > 0) {
      const seen = new Set<ProgramFile>()
      const queue = [file]
      for (let next = queue.pop(); next !== undefined; next = queue.pop()) {
        if (seen.has(next) || !(next instanceof StaticAuxiliaryFile)) {
          continue
        }
        seen.add(next)
        const content = next.content.toString()
        this.#throwIfRequiresRefused(content, true)
        queue.push(...this.snippetFilesRequiredBy(content, { sameFolder: true }))
      }
    }
    this.#usedAuxiliarySnippetFiles.add(file)
  }

  #throwIfRequiresRefused (content: string, sameFolder: boolean) {
    if (this.#refusedSnippetsByFilename.size === 0) {
      return
    }
    for (const candidates of requiredSnippetCandidates(content, sameFolder)) {
      // A converted snippet of the same name takes precedence, as a lookup
      // of the files would find that one.
      if (candidates.some(candidate => this.#auxiliarySnippetFilesByFilename.has(candidate))) {
        continue
      }
      for (const candidate of candidates) {
        const refused = this.#refusedSnippetsByFilename.get(candidate)
        if (refused !== undefined) {
          throw refused
        }
      }
    }
  }

  /** Every registered snippet file. */
  get auxiliarySnippetFiles (): ProgramFile[] {
    return [...this.#auxiliarySnippetFilesByPhysicalId.values()]
  }

  /**
   * The snippet files the generated code itself uses: those a script names
   * by ID or requires, not counting what the snippets require in turn.
   */
  get usedAuxiliarySnippetFiles (): ReadonlySet<ProgramFile> {
    return this.#usedAuxiliarySnippetFiles
  }
}
