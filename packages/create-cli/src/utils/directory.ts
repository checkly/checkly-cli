import * as fs from 'fs'

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

  for (const file of FILE_TO_KEEP) {
    fs.renameSync(`${dirPath}/${file}`, `./${file}`)
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
  return fs.existsSync('./.gitignore')
}

export function isValidUrl (urlString: string) {
  const urlPattern = new RegExp('^(https?:\\/\\/)?' + // validate protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // validate domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))' + // validate OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // validate port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?' + // validate query string
    '(\\#[-a-z\\d_]*)?$', 'i') // validate fragment locator
  return !!urlPattern.test(urlString)
}
