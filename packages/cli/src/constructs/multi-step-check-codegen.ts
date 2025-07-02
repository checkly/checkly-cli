import { expr, ident } from '../sourcegen'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config-codegen'
import { buildRuntimeCheckProps, RuntimeCheckResource } from './check-codegen'
import { Codegen, Context } from './internal/codegen'

export interface MultiStepCheckResource extends RuntimeCheckResource {
  checkType: 'MULTI_STEP'
  script: string
  scriptPath?: string
  playwrightConfig?: PlaywrightConfigResource
}

const construct = 'MultiStepCheck'

export class MultiStepCheckCodegen extends Codegen<MultiStepCheckResource> {
  describe (resource: MultiStepCheckResource): string {
    return `Multistep Check: ${resource.name}`
  }

  gencode (logicalId: string, resource: MultiStepCheckResource, context: Context): void {
    const filePath = context.filePath('resources/multi-step-checks', resource.name, {
      tags: resource.tags,
      isolate: true,
      unique: true,
    })

    const file = this.program.generatedConstructFile(filePath.fullPath)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.object('code', builder => {
            const scriptFile = this.program.staticSpecFile(filePath.extless, resource.script)
            builder.string('entrypoint', file.relativePath(scriptFile))
          })

          if (resource.playwrightConfig) {
            builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
          }

          buildRuntimeCheckProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
