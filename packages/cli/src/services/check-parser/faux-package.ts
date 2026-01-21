import { Package } from './package-files/workspace'

const DESCRIPTION = `This is a placeholder for an otherwise unused package `
  + `that Checkly determined to be needed during the installation step.`

export function createFauxPackageFiles (pkg: Package) {
  return [{
    filePath: pkg.packageJsonPath,
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
