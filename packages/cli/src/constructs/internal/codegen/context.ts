import { dirname } from 'node:path'

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

  filename (resourceName: string, tags?: string[]): { filename: string, stub: string } {
    const stub = (filename: string) => {
      const index = filename.indexOf('.')
      return index !== -1 ? filename.slice(0, index) : filename
    }

    if (tags !== undefined) {
      for (const tag of tags) {
        if (tag.startsWith(CHECKLY_IMPORT_FILENAME_TAG_PREFIX)) {
          const filename = tag.slice(CHECKLY_IMPORT_FILENAME_TAG_PREFIX.length)
          return {
            filename,
            stub: stub(filename),
          }
        }
      }
    }

    const filename = kebabCase(resourceName)
    return {
      filename,
      stub: stub(filename),
    }
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
