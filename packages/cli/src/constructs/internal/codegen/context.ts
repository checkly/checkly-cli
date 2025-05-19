import path, { dirname } from 'node:path'

import { CaseFormat, GeneratedFile, IdentifierValue, cased } from '../../../sourcegen'
import { ProgramFile } from '../../../sourcegen/program'
import { parseSnippetDependencies } from './snippet'
import { ConstructExport } from '../../project'

export class MissingContextVariableMappingError extends Error {}

export class VariableLocator {
  readonly id: IdentifierValue
  readonly file: GeneratedFile

  constructor (id: IdentifierValue, file: GeneratedFile) {
    this.id = id
    this.file = file
  }
}

export class FriendVariableLocator {
  readonly id: IdentifierValue
  readonly filePath: string

  constructor (id: IdentifierValue, filePath: string) {
    this.id = id
    this.filePath = filePath
  }
}

const CHECKLY_IMPORT_FILENAME_TAG_PREFIX = 'checkly-import-filename:'

export interface FilenameOptions {
  tags?: string[]
  isolate?: boolean
  unique?: boolean
  contentKey?: string
  case?: CaseFormat
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
  let prefix = cased(name, 'camelCase').replace(/^[0-9]+/, '')

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

export class Context {
  #alertChannelVariablesByPhysicalId = new Map<number, VariableLocator>()
  #alertChannelFriendVariablesByPhysicalId = new Map<number, FriendVariableLocator>()

  #checkAlertChannelPhysicalIdsByPhysicalId = new Map<string, number[]>()
  #checkPrivateLocationPhysicalIdsByPhysicalId = new Map<string, string[]>()

  #checkGroupAlertChannelPhysicalIdsByPhysicalId = new Map<number, number[]>()
  #checkGroupPrivateLocationPhysicalIdsByPhysicalId = new Map<number, string[]>()
  #checkGroupVariablesByPhysicalId = new Map<number, VariableLocator>()
  #checkGroupFriendVariablesByPhysicalId = new Map<number, FriendVariableLocator>()

  #privateLocationVariablesByPhysicalId = new Map<string, VariableLocator>()
  #privateLocationFriendVariablesByPhysicalId = new Map<string, FriendVariableLocator>()

  #statusPageServiceVariablesByPhysicalId = new Map<string, VariableLocator>()
  #statusPageServiceFriendVariablesByPhysicalId = new Map<string, FriendVariableLocator>()

  #knownSecrets = new Set<string>()

  #knownFilePaths = new Map<string, number>()
  #filePathContentKeys = new Map<string, string>()

  #auxiliarySnippetFilesByPhysicalId = new Map<number, ProgramFile>()
  #auxiliarySnippetFilesByFilename = new Map<string, ProgramFile>()

  #reservedIdentifiersByFilePath = new Map<string, Map<string, number>>()

  #reserveIdentifier (filePath: string, name: string): IdentifierValue {
    const fileVariables = this.#reservedIdentifiersByFilePath.get(filePath)
      ?? new Map<string, number>()

    this.#reservedIdentifiersByFilePath.set(filePath, fileVariables)

    // First use? Let it through.
    let nth = fileVariables.get(name) ?? 0
    if (nth === 0) {
      fileVariables.set(name, 1)
      return new IdentifierValue(name)
    }

    // Nth use? Try to find the next available number, keeping in mind the
    // possibility that someone may have separately reserved a variable with
    // the same counter value at the end, which can happen if the base
    // variable name includes a number.
    //
    // Starts counting from 2 (first use has no counter appended).
    let newName: string
    do {
      nth += 1
      newName = `${name}${nth}`
    } while (fileVariables.has(newName))

    fileVariables.set(newName, nth)
    return new IdentifierValue(newName)
  }

  filePath (parent: string, hint: string, options?: FilenameOptions): FilePath {
    let filename = cased(hint, options?.case ?? 'kebab-case')

    if (options?.tags !== undefined) {
      for (const tag of options.tags) {
        if (tag.startsWith(CHECKLY_IMPORT_FILENAME_TAG_PREFIX)) {
          filename = tag.slice(CHECKLY_IMPORT_FILENAME_TAG_PREFIX.length)
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

  importVariable (locator: VariableLocator, file: GeneratedFile): void {
    file.namedImport(locator.id.value, locator.file.path, {
      relativeTo: dirname(file.path),
    })
  }

  importFriendVariable (locator: FriendVariableLocator, file: GeneratedFile): void {
    file.namedImport(locator.id.value, locator.filePath, {
      relativeTo: dirname(file.path),
    })
  }

  registerCheckGroup (physicalId: number, name: string, file: GeneratedFile): VariableLocator {
    const id = this.#reserveIdentifier(file.path, formatVariable('group', name))
    const locator = new VariableLocator(id, file)
    this.#checkGroupVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupCheckGroup (physicalId: number): VariableLocator {
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

  registerAlertChannel (physicalId: number, name: string, file: GeneratedFile): VariableLocator {
    const id = this.#reserveIdentifier(file.path, formatVariable('alert', name))
    const locator = new VariableLocator(id, file)
    this.#alertChannelVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupAlertChannel (physicalId: number): VariableLocator {
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

  registerPrivateLocation (physicalId: string, name: string, file: GeneratedFile): VariableLocator {
    const id = this.#reserveIdentifier(file.path, formatVariable('location', name))
    const locator = new VariableLocator(id, file)
    this.#privateLocationVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupPrivateLocation (physicalId: string): VariableLocator {
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

  registerStatusPageService (physicalId: string, name: string, file: GeneratedFile): VariableLocator {
    const id = this.#reserveIdentifier(file.path, formatVariable('service', name))
    const locator = new VariableLocator(id, file)
    this.#statusPageServiceVariablesByPhysicalId.set(physicalId, locator)
    return locator
  }

  lookupStatusPageService (physicalId: string): VariableLocator {
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

  lookupAuxiliarySnippetFile (physicalId: number): ProgramFile | undefined {
    return this.#auxiliarySnippetFilesByPhysicalId.get(physicalId)
  }

  findScriptSnippetFiles (content: string): ProgramFile[] {
    const files = new Set<ProgramFile>()

    const filenames = parseSnippetDependencies(content)

    for (const filename of filenames) {
      const { name } = path.parse(filename)

      const candidates = [
        name,
        filename,
        `${name}.ts`,
        `${name}.js`,
        `${filename}.ts`,
        `${filename}.js`,
      ]

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
}
