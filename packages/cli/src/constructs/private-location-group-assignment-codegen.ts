import { Codegen, Context } from './internal/codegen'

export interface PrivateLocationGroupAssignmentResource {
  privateLocationId: string
  groupId: number
}

export class PrivateLocationGroupAssignmentCodegen extends Codegen<PrivateLocationGroupAssignmentResource> {
  describe (resource: PrivateLocationGroupAssignmentResource): string {
    return 'Private Location Group Assignment'
  }

  prepare (logicalId: string, resource: PrivateLocationGroupAssignmentResource, context: Context): void {
    context.registerPrivateLocationGroupAssignment(resource.privateLocationId, resource.groupId)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gencode (logicalId: string, resource: PrivateLocationGroupAssignmentResource, context: Context): void {
    // Nothing to generate for this resource.
  }
}
