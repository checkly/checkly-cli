import { expr, ident } from '../sourcegen/index.js'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config-codegen.js'
import { buildRuntimeCheckProps, RuntimeCheckResource } from './check-codegen.js'
import { Codegen, Context } from './internal/codegen/index.js'
import { MISSING_SCRIPT } from './browser-check-codegen.js'

export interface MultiStepCheckResource extends RuntimeCheckResource {
  checkType: 'MULTI_STEP'
  // Null on a row stored without one; see `MISSING_SCRIPT`.
  script: string | null
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
            const scriptFile = this.program.staticSpecFile(filePath.extless, resource.script ?? MISSING_SCRIPT)
            builder.string('entrypoint', file.relativePath(scriptFile))
          })

          if (resource.playwrightConfig) {
            builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
          }

          buildRuntimeCheckProps(this.program, file, builder, resource, context, {
            includeAutomaticCheckRepair: true,
          })
        })
      })
    }))
  }
}
