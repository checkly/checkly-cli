import path, { dirname } from 'node:path'

import { GeneratedFile, IdentifierValue, kebabCase } from '../../../sourcegen'

export class MissingContextVariableMappingError extends Error {}

export class VariableLocator {
  readonly id: IdentifierValue
  readonly file: GeneratedFile

  constructor (id: IdentifierValue, file: GeneratedFile) {
    this.id = id
    this.file = file
  }
}

const CHECKLY_IMPORT_FILENAME_TAG_PREFIX = 'checkly-import-filename:'

export interface FilenameOptions {
  tags?: string[]
  isolate?: boolean
  unique?: boolean
  contentKey?: string
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

export class Context {
  #alertChannelVariablesByPhysicalId = new Map<number, VariableLocator>()

  #checkAlertChannelPhysicalIdsByPhysicalId = new Map<string, number[]>()
  #checkPrivateLocationPhysicalIdsByPhysicalId = new Map<string, string[]>()

  #checkGroupAlertChannelPhysicalIdsByPhysicalId = new Map<number, number[]>()
  #checkGroupPrivateLocationPhysicalIdsByPhysicalId = new Map<number, string[]>()
  #checkGroupVariablesByPhysicalId = new Map<number, VariableLocator>()

  #privateLocationVariablesByPhysicalId = new Map<string, VariableLocator>()

  #statusPageServiceVariablesByPhysicalId = new Map<string, VariableLocator>()

  #knownSecrets = new Set<string>()

  #knownFilePaths = new Map<string, number>()
  #filePathContentKeys = new Map<string, string>()

  filePath (parent: string, hint: string, options?: FilenameOptions): FilePath {
    let filename = kebabCase(hint)

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
    } while (true)
  }

  importVariable (locator: VariableLocator, file: GeneratedFile): void {
    file.namedImport(locator.id.value, locator.file.path, {
      relativeTo: dirname(file.path),
    })
  }

  registerCheckGroup (physicalId: number, file: GeneratedFile): VariableLocator {
    const nth = this.#checkGroupVariablesByPhysicalId.size + 1
    const id = new IdentifierValue(`group${nth}`)
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

  registerAlertChannel (physicalId: number, variablePrefix: string, file: GeneratedFile): VariableLocator {
    const nth = this.#alertChannelVariablesByPhysicalId.size + 1
    const id = new IdentifierValue(`${variablePrefix}${nth}`)
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

  registerPrivateLocation (physicalId: string, file: GeneratedFile): VariableLocator {
    const nth = this.#privateLocationVariablesByPhysicalId.size + 1
    const id = new IdentifierValue(`privateLocation${nth}`)
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

  registerStatusPageService (physicalId: string, file: GeneratedFile): VariableLocator {
    const nth = this.#statusPageServiceVariablesByPhysicalId.size + 1
    const id = new IdentifierValue(`service${nth}`)
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

  registerKnownSecret (name: string): boolean {
    if (this.#knownSecrets.has(name)) {
      return false
    }

    this.#knownSecrets.add(name)
    return true
  }
}
