import { expr, ident } from '../sourcegen'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config-codegen'
import { buildCheckProps, CheckResource } from './check-codegen'
import { Codegen } from './internal/codegen'

export interface MultiStepCheckResource extends CheckResource {
  checkType: 'MULTI_STEP'
  script: string
  scriptPath?: string
  playwrightConfig?: PlaywrightConfigResource
}

const construct = 'MultiStepCheck'

export class MultiStepCheckCodegen extends Codegen<MultiStepCheckResource> {
  gencode (logicalId: string, resource: MultiStepCheckResource): void {
    this.program.import(construct, 'checkly/constructs')

    this.program.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.object('code', builder => {
            if (resource.scriptPath) {
            // TODO separate file
              builder.string('entrypoint', resource.scriptPath)
              builder.string('content', resource.script)
            } else {
              builder.string('content', resource.script)
            }
          })

          if (resource.playwrightConfig) {
            builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
          }

          buildCheckProps(this.program, builder, resource)
        })
      })
    }))
  }
}
