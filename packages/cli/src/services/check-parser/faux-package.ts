import { Package } from './package-files/workspace.js'
import { VirtualFile } from './parser.js'

export const FAUX_PACKAGE_DESCRIPTION = `This is a placeholder for an `
  + `otherwise unused package that Checkly determined to be needed during `
  + `the installation step.`

/**
 * The version used when the package's real version cannot be determined
 * (e.g. its package.json is unreadable or has no version field).
 */
export const FAUX_PACKAGE_FALLBACK_VERSION = '0.0.0'

export function createFauxPackageFiles (pkg: Package): VirtualFile[] {
  // Carry the package's real version so that specifiers like `workspace:^1.2.3`
  // (pnpm) or plain semver ranges (npm) still resolve to the workspace package
  // rather than failing or falling back to a registry lookup.
  return [{
    filePath: pkg.packageJsonPath,
    physical: false,
    content: JSON.stringify(
      {
        name: pkg.name,
        version: pkg.version ?? FAUX_PACKAGE_FALLBACK_VERSION,
        description: FAUX_PACKAGE_DESCRIPTION,
        private: true,
      },
      undefined,
      2,
    ),
  }]
}
