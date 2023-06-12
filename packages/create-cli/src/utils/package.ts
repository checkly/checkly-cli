import * as fs from 'fs'
import * as path from 'path'

export interface PackageJson {
  name: string;
  devDependencies: {
    [key: string]: string;
  };
}

export function hasPackageJsonFile () {
  return fs.existsSync(path.join(process.cwd(), 'package.json'))
}

export function readPackageJson (): PackageJson {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'))
}
