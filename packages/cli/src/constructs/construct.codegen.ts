import { Codegen } from '../codegen'
import { Program } from '../sourcegen'

import { AlertChannelCodegen } from './alert-channel.codegen'
import { CheckCodegen } from './check.codegen'
import { CheckGroupCodegen } from './check-group.codegen'
import { DashboardCodegen } from './dashboard.codegen'
import { MaintenanceWindowCodegen } from './maintenance-window.codegen'
import { PrivateLocationCodegen } from './private-location.codegen'

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

export class ConstructCodegen extends Codegen<Resource> {
  alertChannelCodegen: AlertChannelCodegen
  checkCodegen: CheckCodegen
  checkGroupCodegen: CheckGroupCodegen
  dashboardCodegen: DashboardCodegen
  maintenanceWindowCodegen: MaintenanceWindowCodegen
  privateLocationCodegen: PrivateLocationCodegen

  constructor (program: Program) {
    super(program)
    this.alertChannelCodegen = new AlertChannelCodegen(program)
    this.checkCodegen = new CheckCodegen(program)
    this.checkGroupCodegen = new CheckGroupCodegen(program)
    this.dashboardCodegen = new DashboardCodegen(program)
    this.maintenanceWindowCodegen = new MaintenanceWindowCodegen(program)
    this.privateLocationCodegen = new PrivateLocationCodegen(program)
  }

  gencode (logicalId: string, resource: Resource): void {
    switch (resource.type) {
      case 'alert-channel-subscription':
        return // Skip temporarily
      case 'alert-channel':
        return this.alertChannelCodegen.gencode(resource.logicalId, resource.payload)
      case 'check-group':
        return this.checkGroupCodegen.gencode(resource.logicalId, resource.payload)
      case 'check': {
        return this.checkCodegen.gencode(resource.logicalId, resource.payload)
      }
      case 'dashboard':
        return this.dashboardCodegen.gencode(resource.logicalId, resource.payload)
      case 'maintenance-window':
        return this.maintenanceWindowCodegen.gencode(resource.logicalId, resource.payload)
      case 'private-location-check-assignment':
        return // Skip temporarily
      case 'private-location-group-assignment':
        return // Skip temporarily
      case 'private-location':
        return this.privateLocationCodegen.gencode(resource.logicalId, resource.payload)
      default:
        throw new Error(`Unable to generate code for unsupported resource type '${resource.type}'.`)
    }
  }
}
