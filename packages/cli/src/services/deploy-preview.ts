import * as api from '../rest/api'
import { DiffResult, utilsService } from './util'
import { ProjectData, ProjectPayload } from '../constructs'
import { ResourceSync } from '../rest/projects'
import { AlertChannelApi } from '../rest/alert-channels'

export type ResourcesTypes = keyof ProjectData

export interface DeployPreviewDiff {
  resourceType: ResourcesTypes
  logicalId: string
  diffResult: DiffResult
}

export class DeployPreview {
  readonly resources: ResourceSync[] = []
  private serverStateAlertChannel: AlertChannelApi[] = []
  constructor (projectPayload: ProjectPayload) {
    this.resources = projectPayload.resources
  }

  private async getServerStateByResourceType (resourceType: ResourcesTypes) {
    if (resourceType === 'alert-channel') {
      const { data: serverStateAlertChannel } = await this.getAlertChannelsServerState()
      this.serverStateAlertChannel = serverStateAlertChannel
    }
  }

  public getUniqueResourceType (): string[] {
    return utilsService.uniqValFromArrByKey(this.resources, 'type')
  }

  private getAlertChannelsServerState () {
    return api.alertChannels.getAll()
  }

  private getResourcesAndServerStateDiff (resource: ResourceSync): DeployPreviewDiff {
    let diffResult: DiffResult = null
    if (resource.type === 'alert-channel' && this.serverStateAlertChannel.length) {
      const serverStateItem = this.serverStateAlertChannel.find((item) => item.type === resource.payload.type)
      if (serverStateItem) {
        diffResult = utilsService.compareObjectsWithExistingKeys(resource.payload, serverStateItem)
      }
    }
    return {
      resourceType: resource.type as ResourcesTypes,
      logicalId: resource.logicalId,
      diffResult,
    }
  }

  public async getDiff (): Promise<DeployPreviewDiff[]> {
    const resourcesTypes = this.getUniqueResourceType() as ResourcesTypes[]
    await Promise.all(resourcesTypes.map(this.getServerStateByResourceType.bind(this)))
    return this.resources.map(this.getResourcesAndServerStateDiff.bind(this))
  }
}
