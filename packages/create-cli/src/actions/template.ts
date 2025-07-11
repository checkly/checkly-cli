import fs from 'node:fs/promises'
import path from 'node:path'

import chalk from 'chalk'
import { downloadTemplate } from 'giget'
import { spinner } from '../utils/terminal'

export interface CopyTemplateProps {
  template: string
  templatePath: string
  targetDir: string
}

export async function copyTemplate ({ template, templatePath, targetDir }: CopyTemplateProps) {
  const downloadTemplateSpinner = spinner('Downloading example template...')

  const localRoot = process.env.CHECKLY_E2E_LOCAL_TEMPLATE_ROOT
  if (localRoot !== undefined) {
    const localTemplate = path.join(localRoot, template)
    await fs.cp(localTemplate, targetDir, {
      recursive: true,
    })
  } else {
    try {
      await downloadTemplate(templatePath, {
        force: true,
        cwd: targetDir,
        dir: '.',
      })
    } catch (e: any) {
      if (e.message.includes('404')) {
        downloadTemplateSpinner.text = chalk.red(`Couldn't find template "${template}"`)
        downloadTemplateSpinner.fail()
      } else {
        // eslint-disable-next-line
        console.error(e.message)
      }
      process.exit(1)
    }
  }

  downloadTemplateSpinner.text = chalk.green('Example template copied!')
  downloadTemplateSpinner.succeed()
}
