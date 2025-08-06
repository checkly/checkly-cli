import { Codegen, Context } from './internal/codegen'

export interface PrivateLocationCheckAssignmentResource {
  privateLocationId: string
  checkId: string
}

export class PrivateLocationCheckAssignmentCodegen extends Codegen<PrivateLocationCheckAssignmentResource> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  describe (resource: PrivateLocationCheckAssignmentResource): string {
    return 'Private Location Check Assignment'
  }

  prepare (logicalId: string, resource: PrivateLocationCheckAssignmentResource, context: Context): void {
    context.registerPrivateLocationCheckAssignment(resource.privateLocationId, resource.checkId)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gencode (logicalId: string, resource: PrivateLocationCheckAssignmentResource, context: Context): void {
    // Nothing to generate for this resource.
  }
}
