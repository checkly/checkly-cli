import { expr, ident, Program } from '../sourcegen'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config.codegen'
import { buildCheckProps, CheckResource } from './check.codegen'

export interface MultiStepCheckResource extends CheckResource {
  checkType: 'MULTI_STEP'
  script: string
  scriptPath?: string
  playwrightConfig?: PlaywrightConfigResource
}

const construct = 'MultiStepCheck'

export function source (program: Program, logicalId: string, resource: MultiStepCheckResource): void {
  program.import(construct, 'checkly/constructs')

  program.section(expr(ident(construct), builder => {
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

        buildCheckProps(program, builder, resource)
      })
    })
  }))
}
