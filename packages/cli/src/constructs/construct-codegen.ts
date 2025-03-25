import { Codegen, Context } from './internal/codegen'
import { Program } from '../sourcegen'

import { AlertChannelCodegen } from './alert-channel-codegen'
import { AlertChannelSubscriptionCodegen } from './alert-channel-subscription-codegen'
import { CheckCodegen } from './check-codegen'
import { CheckGroupCodegen } from './check-group-codegen'
import { DashboardCodegen } from './dashboard-codegen'
import { MaintenanceWindowCodegen } from './maintenance-window-codegen'
import { PrivateLocationCodegen } from './private-location-codegen'
import { PrivateLocationCheckAssignmentCodegen } from './private-location-check-assignment-codegen'
import { PrivateLocationGroupAssignmentCodegen } from './private-location-group-assignment-codegen'

export type ResourceType =
  'alert-channel-subscription' |
  'alert-channel' |
  'check-group' |
  'check' |
  'dashboard' |
  'maintenance-window' |
  'private-location-check-assignment' |
  'private-location-group-assignment' |
  'private-location'

interface Resource {
  type: ResourceType
  logicalId: string
  payload: any
}

const resourceOrder: Record<ResourceType, number> = {
  'alert-channel-subscription': 800,
  'alert-channel': 810,
  'check-group': 700,
  check: 600,
  dashboard: 0,
  'maintenance-window': 0,
  'private-location-check-assignment': 900,
  'private-location-group-assignment': 900,
  'private-location': 910,
}

export function sortResources (resources: Resource[]): Resource[] {
  return resources.sort((a, b) => {
    const ao = resourceOrder[a.type] ?? -1
    const bo = resourceOrder[b.type] ?? -1
    return bo - ao
  })
}

export class ConstructCodegen extends Codegen<Resource> {
  alertChannelCodegen: AlertChannelCodegen
  alertChannelSubscriptionCodegen: AlertChannelSubscriptionCodegen
  checkCodegen: CheckCodegen
  checkGroupCodegen: CheckGroupCodegen
  dashboardCodegen: DashboardCodegen
  maintenanceWindowCodegen: MaintenanceWindowCodegen
  privateLocationCodegen: PrivateLocationCodegen
  privateLocationCheckAssignmentCodegen: PrivateLocationCheckAssignmentCodegen
  privateLocationGroupAssignmentCodegen: PrivateLocationGroupAssignmentCodegen
  codegensByType: Record<ResourceType, Codegen<any>>

  constructor (program: Program) {
    super(program)
    this.alertChannelCodegen = new AlertChannelCodegen(program)
    this.alertChannelSubscriptionCodegen = new AlertChannelSubscriptionCodegen(program)
    this.checkCodegen = new CheckCodegen(program)
    this.checkGroupCodegen = new CheckGroupCodegen(program)
    this.dashboardCodegen = new DashboardCodegen(program)
    this.maintenanceWindowCodegen = new MaintenanceWindowCodegen(program)
    this.privateLocationCodegen = new PrivateLocationCodegen(program)
    this.privateLocationCheckAssignmentCodegen = new PrivateLocationCheckAssignmentCodegen(program)
    this.privateLocationGroupAssignmentCodegen = new PrivateLocationGroupAssignmentCodegen(program)

    this.codegensByType = {
      'alert-channel-subscription': this.alertChannelSubscriptionCodegen,
      'alert-channel': this.alertChannelCodegen,
      'check-group': this.checkGroupCodegen,
      check: this.checkCodegen,
      dashboard: this.dashboardCodegen,
      'maintenance-window': this.maintenanceWindowCodegen,
      'private-location-check-assignment': this.privateLocationCheckAssignmentCodegen,
      'private-location-group-assignment': this.privateLocationGroupAssignmentCodegen,
      'private-location': this.privateLocationCodegen,
    }
  }

  prepare (logicalId: string, resource: Resource, context: Context): void {
    const codegen = this.codegensByType[resource.type]
    if (codegen === undefined) {
      throw new Error(`Unable to generate code for unsupported resource type '${resource.type}'.`)
    }

    codegen.prepare(resource.logicalId, resource.payload, context)
  }

  gencode (logicalId: string, resource: Resource, context: Context): void {
    const codegen = this.codegensByType[resource.type]
    if (codegen === undefined) {
      throw new Error(`Unable to generate code for unsupported resource type '${resource.type}'.`)
    }

    codegen.gencode(resource.logicalId, resource.payload, context)
  }
}
