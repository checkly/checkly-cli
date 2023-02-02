import * as fs from 'fs'

export function isValidProjectDirectory (dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    return true
  }
}

export function hasGitDir () {
  return fs.existsSync('./.git')
}
