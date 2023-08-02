import * as chalk from 'chalk'
import { downloadTemplate } from 'giget'
import { spinner } from '../utils/terminal'

export interface CopyTemplateProps {
  template: string
  templatePath: string
  branch: string
  targetDir: string
}

export async function copyTemplate ({ template, templatePath, branch = '4.0.13', targetDir }: CopyTemplateProps) {
  const downloadTemplateSpinner = spinner('Downloading example template...')

  try {
    await downloadTemplate(`${templatePath}#${branch}`, {
      force: true,
      cwd: targetDir,
      dir: '.',
    })
  } catch {
    // retry to download template from main branch (without specifing version tag)
    try {
      downloadTemplateSpinner.text = chalk.yellow(`Couldn't find template "${template}" (v${branch}). Retrying...`)
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
