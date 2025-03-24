import { Codegen } from '../codegen'
import { expr, ident } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check.codegen'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config.codegen'

export interface BrowserCheckResource extends CheckResource{
  checkType: 'BROWSER'
  script: string
  scriptPath?: string
  sslCheckDomain?: string | null
  playwrightConfig?: PlaywrightConfigResource
}

const construct = 'BrowserCheck'

export class BrowserCheckCodegen extends Codegen<BrowserCheckResource> {
  gencode (logicalId: string, resource: BrowserCheckResource): void {
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

          if (resource.sslCheckDomain) {
            builder.string('sslCheckDomain', resource.sslCheckDomain)
          }

          if (resource.playwrightConfig) {
            builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
          }

          buildCheckProps(this.program, builder, resource)
        })
      })
    }))
  }
}
