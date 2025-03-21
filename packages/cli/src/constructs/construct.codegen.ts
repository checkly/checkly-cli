import { Program } from '../sourcegen'

import { codegen as alertChannelCodegen } from './alert-channel.codegen'
import { codegen as apiCheckCodegen } from './api-check.codegen'
import { codegen as browserCheckCodegen } from './browser-check.codegen'
import { codegen as checkGroupCodegen } from './check-group.codegen'
import { codegen as dashboardCodegen } from './dashboard.codegen'
import { codegen as heartbeatCheckCodegen } from './heartbeat-check.codegen'
import { codegen as maintenanceWindowCodegen } from './maintenance-window.codegen'
import { codegen as multiStepCheckCodegen } from './multi-step-check.codegen'
import { codegen as privateLocationCheckCodegen } from './private-location.codegen'
import { codegen as tcpCheckCodegen } from './tcp-check.codegen'

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

export function codegen (program: Program, resource: Resource): void {
  switch (resource.type) {
    case 'alert-channel-subscription':
      return // Skip temporarily
    case 'alert-channel':
      return alertChannelCodegen(program, resource.logicalId, resource.payload)
    case 'check-group':
      return checkGroupCodegen(program, resource.logicalId, resource.payload)
    case 'check': {
      const checkType = resource.payload.checkType
      switch (checkType) {
        case 'BROWSER':
          return browserCheckCodegen(program, resource.logicalId, resource.payload)
        case 'API':
          return apiCheckCodegen(program, resource.logicalId, resource.payload)
        case 'TCP':
          return tcpCheckCodegen(program, resource.logicalId, resource.payload)
        case 'MULTI_STEP':
          return multiStepCheckCodegen(program, resource.logicalId, resource.payload)
        case 'HEARTBEAT':
          return heartbeatCheckCodegen(program, resource.logicalId, resource.payload)
        default:
          throw new Error(`Unable to generate for for unsupported check type '${checkType}'.`)
      }
    }
    case 'dashboard':
      return dashboardCodegen(program, resource.logicalId, resource.payload)
    case 'maintenance-window':
      return maintenanceWindowCodegen(program, resource.logicalId, resource.payload)
    case 'private-location-check-assignment':
      return // Skip temporarily
    case 'private-location-group-assignment':
      return // Skip temporarily
    case 'private-location':
      return privateLocationCheckCodegen(program, resource.logicalId, resource.payload)
    default:
      throw new Error(`Unable to generate for for unsupported resource type '${resource.type}'.`)
  }
}
