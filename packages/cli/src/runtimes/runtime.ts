export interface Runtime {
  name: string
  stage?: string
  runtimeEndOfLife?: string
  description?: string
  dependencies: Record<string, string>
  multiStepSupport?: boolean
}
