import * as fs from 'fs'
import * as path from 'path'
import { uniqueNamesGenerator, colors, animals } from 'unique-names-generator'

export interface PackageJson {
  name: string;
  devDependencies: {
    [key: string]: string;
  };
}

export function hasPackageJsonFile (dirPath: string) {
  return fs.existsSync(path.join(dirPath, 'package.json'))
}

export function readPackageJson (dirPath: string): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(dirPath, 'package.json'), 'utf-8'))
}

export function isValidProjectDirectory (dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    return true
  }
  // allow already initiated projects directory
  if (hasPackageJsonFile(dirPath)) {
    return true
  }
  // only allow non initiated directory if it's empty
  return fs.readdirSync(dirPath).length === 0
}

export function hasGitDir (dirPath: string) {
  return fs.existsSync(path.join(dirPath, './.git'))
}

export function checkFilesToKeep (filesToKeep: string[], dirPath: string) {
  if (filesToKeep.some(file =>
    fs.existsSync(path.join(dirPath, file)))) {
    process.stderr.write('It looks like you already have "__checks__" folder or "checkly.config.ts". ' +
      'Please, remove them and try again.' + '\n')
    process.exit(1)
  }
}

export function copyTemporaryFiles (filesToKeep: string[], dirPath: string, tempPath: string) {
  for (const file of filesToKeep) {
    fs.renameSync(`${tempPath}/${file}`, path.join(dirPath, file))
  }
  fs.rmSync(tempPath, { recursive: true })
}

export function usePackageName (packageName: string) {
  const filePath = './checkly.config.ts'
  const checklyConfig = fs.readFileSync(filePath, 'utf-8')

  fs.writeFileSync(filePath, checklyConfig
    .replace(/Boilerplate Project/, packageName)
    .replace(/boilerplate-project/, packageName),
  )
}
export function hasGitIgnore (dirPath: string) {
  return fs.existsSync(path.join(dirPath, '.gitignore'))
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
