import { IdentifierValue } from '../../../sourcegen'

export class MissingContextVariableMappingError extends Error {}

export class Context {
  #alertChannelVariablesByPhysicalId = new Map<number, IdentifierValue>()

  #checkAlertChannelPhysicalIdsByPhysicalId = new Map<string, number[]>()
  #checkPrivateLocationPhysicalIdsByPhysicalId = new Map<string, string[]>()

  #checkGroupAlertChannelPhysicalIdsByPhysicalId = new Map<number, number[]>()
  #checkGroupPrivateLocationPhysicalIdsByPhysicalId = new Map<number, string[]>()
  #checkGroupVariablesByPhysicalId = new Map<number, IdentifierValue>()

  #privateLocationVariablesByPhysicalId = new Map<string, IdentifierValue>()

  #statusPageServiceVariablesByPhysicalId = new Map<string, IdentifierValue>()

  registerCheckGroup (physicalId: number): IdentifierValue {
    const nth = this.#checkGroupVariablesByPhysicalId.size + 1
    const variable = new IdentifierValue(`group${nth}`)
    this.#checkGroupVariablesByPhysicalId.set(physicalId, variable)
    return variable
  }

  lookupCheckGroup (physicalId: number): IdentifierValue {
    const id = this.#checkGroupVariablesByPhysicalId.get(physicalId)
    if (id === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return id
  }

  registerAlertChannel (physicalId: number, variablePrefix: string): IdentifierValue {
    const nth = this.#alertChannelVariablesByPhysicalId.size + 1
    const variable = new IdentifierValue(`${variablePrefix}${nth}`)
    this.#alertChannelVariablesByPhysicalId.set(physicalId, variable)
    return variable
  }

  lookupAlertChannel (physicalId: number): IdentifierValue {
    const id = this.#alertChannelVariablesByPhysicalId.get(physicalId)
    if (id === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return id
  }

  registerPrivateLocation (physicalId: string): IdentifierValue {
    const nth = this.#privateLocationVariablesByPhysicalId.size + 1
    const variable = new IdentifierValue(`privateLocation${nth}`)
    this.#privateLocationVariablesByPhysicalId.set(physicalId, variable)
    return variable
  }

  lookupPrivateLocation (physicalId: string): IdentifierValue {
    const id = this.#privateLocationVariablesByPhysicalId.get(physicalId)
    if (id === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return id
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

  registerStatusPageService (physicalId: string): IdentifierValue {
    const nth = this.#statusPageServiceVariablesByPhysicalId.size + 1
    const variable = new IdentifierValue(`service${nth}`)
    this.#statusPageServiceVariablesByPhysicalId.set(physicalId, variable)
    return variable
  }

  lookupStatusPageService (physicalId: string): IdentifierValue {
    const id = this.#statusPageServiceVariablesByPhysicalId.get(physicalId)
    if (id === undefined) {
      throw new MissingContextVariableMappingError()
    }
    return id
  }
}
