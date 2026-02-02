import { Package } from './package-files/workspace'
import { VirtualFile } from './parser'

const DESCRIPTION = `This is a placeholder for an otherwise unused package `
  + `that Checkly determined to be needed during the installation step.`

export function createFauxPackageFiles (pkg: Package): VirtualFile[] {
  return [{
    filePath: pkg.packageJsonPath,
    physical: false,
    content: JSON.stringify(
      {
        name: pkg.name,
        version: '0.0.0',
        description: DESCRIPTION,
        private: true,
      },
      undefined,
      2,
    ),
  }]
}
