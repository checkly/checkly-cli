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
