import * as fs from 'fs'
import * as path from 'path'
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator'

export function isValidProjectDirectory (dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    return true
  }
  return fs.readdirSync(dirPath).length === 0
}

export function hasGitDir () {
  return fs.existsSync('./.git')
}

export function copyTemporaryFiles (dirPath: string) {
  const FILE_TO_KEEP = ['__checks__', 'checkly.config.ts']

  if (FILE_TO_KEEP.some(file =>
    fs.existsSync(path.join(process.cwd(), file)))) {
    // eslint-disable-next-line no-console
    console.error('It looks like you already have "__checks__" folder or "checkly.config.ts". ' +
      'Please, remove them and try again.')
    fs.rmSync(dirPath, { recursive: true })
    process.exit(1)
  } else {
    for (const file of FILE_TO_KEEP) {
      fs.renameSync(`${dirPath}/${file}`, path.join(process.cwd(), file))
    }
  }

  fs.rmSync(dirPath, { recursive: true })
}

export function usePackageName (packageName: string) {
  const filePath = './checkly.config.ts'
  const checklyConfig = fs.readFileSync(filePath, 'utf-8')

  fs.writeFileSync(filePath, checklyConfig
    .replace(/Boilerplate Project/, packageName)
    .replace(/boilerplate-project/, packageName),
  )
}
export function hasGitIgnore () {
  return fs.existsSync(path.join(process.cwd(), '.gitignore'))
}

export function isValidUrl (string: string) {
  try {
    const url = new URL(string)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function generateProjectName (): string {
  return uniqueNamesGenerator({
    dictionaries: [colors, animals],
    separator: '-',
    length: 2,
    style: 'lowerCase',
  })
}
