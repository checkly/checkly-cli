import * as fs from 'fs'
import * as path from 'path'
import shell from 'shelljs'

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
    fs.existsSync(path.join(shell.pwd().toString(), file)))) {
    // eslint-disable-next-line no-console
    console.error('It looks like you already have "__checks__" folder or "checkly.config.ts". ' +
      'Please, remove them and try again.')
    fs.rmSync(dirPath, { recursive: true })
    process.exit(1)
  } else {
    for (const file of FILE_TO_KEEP) {
      fs.renameSync(`${dirPath}/${file}`, path.join(shell.pwd().toString(), file))
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
  return fs.existsSync(path.join(shell.pwd().toString(), '.gitignore'))
}

export function isValidUrl (string: string) {
  try {
    const url = new URL(string)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch (_) {
    return false
  }
}
