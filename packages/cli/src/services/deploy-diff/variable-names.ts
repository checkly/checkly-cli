import type { Project } from '../../constructs/project.js'
import { type ConstructExport, Session } from '../../constructs/session.js'
import { exportedNamesOf, findConstructVariable, IDENTIFIER } from '../write-back/source-file.js'
import { idKey, REFERENCEABLE_TYPES } from './import-shape.js'
import { SourceIndex } from './source-index.js'

/** The variable each construct goes by in the user's code, keyed like `PhysicalIds` (`idKey`). */
export type VariableNames = ReadonlyMap<string, string>

/**
 * The name each referenceable construct of the project (a group, an alert
 * channel, a private location, a status page and its parts) has in the
 * user's code, so a deploy preview refers to it the way the code does rather
 * than by a name generated from its logical id.
 *
 * The name the file that creates the construct exports it by comes first: it
 * is what another file imports the construct by, and it is known however the
 * construct was made. A file that exports the construct by several names
 * settles it with the one its declaration uses. Check files are the only
 * files whose exports are seen, so for the rest (a construct declared in a
 * shared module, or one that is not exported) the name is read from the
 * declaration in the file that creates the construct. An export from some
 * other check file, which passes the construct on under a name of its own,
 * comes last. A construct with none of these is left out and keeps its
 * generated name.
 *
 * The name is the one where the construct is made. A file that imports the
 * construct under an alias, or reaches it through a namespace, still calls
 * it something else. And two constructs that go by the same name in
 * different files cannot both have it in one rendered construct: the second
 * one registered gets a counter (`group`, `group2`), the same on both sides
 * of a comparison.
 */
export function constructVariableNames (
  project: Project,
  exports: readonly ConstructExport[] = Session.constructExports,
  sources: SourceIndex = new SourceIndex(),
): VariableNames {
  const names = new Map<string, string>()
  for (const type of REFERENCEABLE_TYPES) {
    for (const [logicalId, construct] of Object.entries(project.data[type])) {
      // A reference construct (`fromId(...)`) is rendered as the reference it is.
      if (construct.member === false) {
        continue
      }
      const declaredIn = construct.checkFileAbsolutePath
      const exported = exports
        .filter(candidate => candidate.type === type && candidate.logicalId === logicalId
          && candidate.exportName !== 'default' && IDENTIFIER.test(candidate.exportName))
      const own = exported.filter(candidate => candidate.filePath === declaredIn).map(({ exportName }) => exportName)
      const declared = () => {
        const source = declaredIn !== undefined ? sources.source(declaredIn) : undefined
        return source && findConstructVariable(source, logicalId, exportedNamesOf(construct))
      }
      let name: string | undefined
      if (own.length === 1) {
        name = own[0]
      } else if (own.length > 1) {
        const variable = declared()
        name = variable !== undefined && own.includes(variable) ? variable : own[0]
      } else {
        name = declared() ?? exported[0]?.exportName
      }
      if (name !== undefined) {
        names.set(idKey(type, logicalId), name)
      }
    }
  }
  return names
}
