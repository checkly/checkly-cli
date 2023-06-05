import * as fs from 'fs'
import * as path from 'path'
import shell from 'shelljs'

export interface PackageJson {
  name: string;
  devDependencies: {
    [key: string]: string;
  };
}

export function hasPackageJsonFile () {
  return fs.existsSync(path.join(shell.pwd(), 'package.json'))
}

export function readPackageJson (): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(shell.pwd(), 'package.json'), 'utf-8'))
}
