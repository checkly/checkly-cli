import { Codegen, Context } from './internal/codegen'

export interface PrivateLocationCheckAssignmentResource {
  privateLocationId: string
  checkId: string
}

export class PrivateLocationCheckAssignmentCodegen extends Codegen<PrivateLocationCheckAssignmentResource> {
  prepare (logicalId: string, resource: PrivateLocationCheckAssignmentResource, context: Context): void {
    context.registerPrivateLocationCheckAssignment(resource.privateLocationId, resource.checkId)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  gencode (logicalId: string, resource: PrivateLocationCheckAssignmentResource, context: Context): void {
    // Nothing to generate for this resource.
  }
}
