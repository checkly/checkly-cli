import * as fs from 'fs'
import path from 'path'

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
  return JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
}
