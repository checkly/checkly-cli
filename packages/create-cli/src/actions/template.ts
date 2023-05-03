import chalk from 'chalk'
import { downloadTemplate } from 'giget'
import { spinner } from '../utils/terminal.js'

export interface CopyTemplateProps {
  template: string;
  templatePath: string;
  targetDir: string;
}

export async function copyTemplate ({ template, templatePath, targetDir }: CopyTemplateProps) {
  const downloadTemplateSpinner = spinner('Downloading example template...')

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
      console.error(e.message)
    }
    process.exit(1)
  }

  downloadTemplateSpinner.text = chalk.green('Example template copied!')
  downloadTemplateSpinner.succeed()
}
