import * as fs from 'fs'

export interface PackageJson {
  name: string;
  devDependencies: {
    [key: string]: string;
  };
}

export function hasPackageJsonFile () {
  return fs.existsSync('./package.json')
}

export function readPackageJson (): PackageJson {
  return JSON.parse(fs.readFileSync('./package.json', 'utf-8'))
}
