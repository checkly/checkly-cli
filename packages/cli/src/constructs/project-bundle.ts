import * as path from 'node:path'
import { Bundle, Construct } from './construct.js'
import { Project, Resources } from './project.js'
import { pathToPosix } from '../services/util.js'

export type ResourceDataBundle<T> = {
  construct: T
  bundle: Bundle
}

export type ProjectDataBundle = {
  [x in keyof Resources]: Record<string, ResourceDataBundle<Resources[x]>>
}

export interface ProjectSynthesizeOptions {
  /**
   * Absolute path of the git repository root. When set, every resource
   * reports the file that declares it as a `sourceFile` relative to this
   * root, so Checkly can open pull requests against the right file.
   */
  repoRoot?: string
}

/**
 * The construct's declaring file relative to the repository root, with posix
 * separators; `undefined` when either path is unknown or the file lives
 * outside the repository.
 *
 * @param platformPath this is for testing purposes only so we can exercise
 * Windows path handling on Linux / Darwin
 */
export function resolveSourceFile (
  repoRoot: string | undefined,
  checkFileAbsolutePath: string | undefined,
  platformPath: path.PlatformPath = path,
): string | undefined {
  if (!repoRoot || !checkFileAbsolutePath) {
    return undefined
  }
  const relativePath = platformPath.relative(repoRoot, checkFileAbsolutePath)
  // An empty result means the file is the root itself; a leading `..` or an
  // absolute result (a different Windows drive) means it lives outside the
  // repository. Neither can be opened as a file in the repository.
  if (!relativePath || relativePath.startsWith('..') || platformPath.isAbsolute(relativePath)) {
    return undefined
  }
  return pathToPosix(relativePath, platformPath.sep)
}

export class ProjectBundle implements Bundle {
  project: Project
  data: ProjectDataBundle

  constructor (project: Project, data: ProjectDataBundle) {
    this.project = project
    this.data = data
  }

  private synthesizeRecord (
    record: Record<string, ResourceDataBundle<Construct>>,
    { repoRoot }: ProjectSynthesizeOptions,
  ) {
    return Object.entries(record)
      .map(([key, { construct, bundle }]) => {
        const sourceFile = resolveSourceFile(repoRoot, construct.checkFileAbsolutePath)
        return {
          logicalId: key,
          type: construct.type,
          physicalId: construct.physicalId,
          member: construct.member,
          payload: bundle.synthesize(),
          // Only present when known, so older backends see an unchanged
          // envelope.
          ...(sourceFile !== undefined ? { sourceFile } : {}),
        }
      })
  }

  synthesize (options: ProjectSynthesizeOptions = {}) {
    return {
      ...this.project.synthesize(),
      resources: [
        // The order in which resources are defined here is important. If
        // resource A may include references to resource B, it should occur
        // later than resource B.
        ...this.synthesizeRecord(this.data['status-page-service'], options),
        ...this.synthesizeRecord(this.data['status-page'], options),
        // v3: components reference their page (and parent group), rules
        // reference the page and components. Declaration order keeps parents
        // before children within components.
        ...this.synthesizeRecord(this.data['status-page-component'], options),
        ...this.synthesizeRecord(this.data['status-page-automation-rule'], options),
        ...this.synthesizeRecord(this.data['check-group'], options),
        ...this.synthesizeRecord(this.data.check, options),
        ...this.synthesizeRecord(this.data['alert-channel'], options),
        ...this.synthesizeRecord(this.data['alert-channel-subscription'], options),
        ...this.synthesizeRecord(this.data['maintenance-window'], options),
        ...this.synthesizeRecord(this.data['private-location'], options),
        ...this.synthesizeRecord(this.data['private-location-check-assignment'], options),
        ...this.synthesizeRecord(this.data['private-location-group-assignment'], options),
        ...this.synthesizeRecord(this.data.dashboard, options),
      ],
    }
  }
}
