import * as path from 'path'
import { BrowserCheck } from '../constructs'

export function filterByCheckNamePattern (checkNamePattern = '', checkName: string) {
  const re = new RegExp(checkNamePattern)
  return re.test(checkName)
}

export function filterByFileNamePattern (filePatterns: Array<string> = [], path: string) {
  return !!filePatterns.find(filePattern => {
    const re = new RegExp(filePattern)
    return re.test(path)
  })
}

export function filterBrowserCheckByFileNamePattern (filePatterns: Array<string> = [], check: BrowserCheck) {
  return !!filePatterns.find(filePattern => {
    const re = new RegExp(filePattern)
    const isSpecFilePattern = /^.+\.spec\.[jt]s$/

    const match = re.test(check.scriptPath || '') || re.test(check.__checkFilePath || '')

    // if the browser-check is created from a spec file, its name is equal to the spec filename
    const isSpecFileCheck = isSpecFilePattern.test(check.name) && check.name === path.basename(check.scriptPath || '')

    return isSpecFilePattern.test(filePattern) ? isSpecFileCheck && re.test(check.name || '') : match
  })
}
