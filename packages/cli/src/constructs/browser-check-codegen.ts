import { Codegen, Context } from './internal/codegen'
import { expr, ident } from '../sourcegen'
import { buildCheckProps, CheckResource } from './check-codegen'
import { PlaywrightConfigResource, valueForPlaywrightConfig } from './playwright-config-codegen'

export interface BrowserCheckResource extends CheckResource {
  checkType: 'BROWSER'
  script: string
  scriptPath?: string
  sslCheckDomain?: string | null
  playwrightConfig?: PlaywrightConfigResource
}

const construct = 'BrowserCheck'

export class BrowserCheckCodegen extends Codegen<BrowserCheckResource> {
  gencode (logicalId: string, resource: BrowserCheckResource, context: Context): void {
    const { filename, stub } = context.filename(resource.name, resource.tags)
    const file = this.program.generatedConstructFile(`resources/browser-checks/${stub}/${filename}`)

    file.namedImport(construct, 'checkly/constructs')

    file.section(expr(ident(construct), builder => {
      builder.new(builder => {
        builder.string(logicalId)
        builder.object(builder => {
          builder.object('code', builder => {
            const scriptFile = this.program.staticSpecFile(`${file.dirname}/${filename}`, resource.script)
            builder.string('entrypoint', file.relativePath(scriptFile))
          })

          if (resource.sslCheckDomain) {
            builder.string('sslCheckDomain', resource.sslCheckDomain)
          }

          if (resource.playwrightConfig) {
            builder.value('playwrightConfig', valueForPlaywrightConfig(resource.playwrightConfig))
          }

          buildCheckProps(this.program, file, builder, resource, context)
        })
      })
    }))
  }
}
