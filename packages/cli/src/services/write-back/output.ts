import path from 'node:path'

import chalk from 'chalk'

import type { Project, ProjectData } from '../../constructs/project.js'
import { padColumn, visWidth } from '../../formatters/render.js'
import { diffLines } from '../deploy-diff/diff-lines.js'
import { pathToPosix } from '../util.js'
import { pointerSegments } from '../deploy-diff/import-shape.js'
import { MARKER, PRETTY_RESOURCE_TYPES, styled } from '../deploy-diff/preview-output.js'
import type { WriteBackLine, WriteBackPlan, WriteBackSkip } from './plan.js'

/**
 * What `checkly deploy` prints after writing the changes made in Checkly into
 * the code. Shaped like the plan the user just read: one header per resource
 * with its class, logical id and file, and under it the diff of the construct
 * source as it was against as it is now, in the plan's markers and colours.
 * What was not written is listed the same way, with the reason per property.
 */

export interface WriteBackOutputInput {
  writeBack: WriteBackPlan
  project: Project
  /** The directory file names are shown relative to. */
  cwd: string
}

const counted = (count: number, one: string, many: string): string => `${count} ${count === 1 ? one : many}`

const sameResource = (a: { type: string, logicalId: string }, b: { type: string, logicalId: string }): boolean =>
  a.type === b.type && a.logicalId === b.logicalId

/** The header line of a resource: marker, class, logical id, and the file when it is known. */
function header (
  marker: string,
  { type, logicalId }: { type: string, logicalId: string },
  file: string | undefined,
  project: Project,
): string {
  const construct = project.data[type as keyof ProjectData]?.[logicalId]
  const name = construct?.constructor.name ?? PRETTY_RESOURCE_TYPES[type] ?? type
  // With forward slashes on every platform, as the plan names the file.
  return `${marker} ${chalk.bold(name)} ${chalk.bold(logicalId)}`
    + (file !== undefined ? `  ${chalk.dim(pathToPosix(file))}` : '')
}

/** A property's old and new source on one line, for a construct whose source cannot be shown as a diff. */
function propertyLine ({ property, previous, rendered }: WriteBackLine): string {
  const oneLine = (text: string) => text.replace(/\s*\r?\n\s*/g, ' ')
  return `    ${property}: ${previous === undefined ? 'not set' : oneLine(previous)} → ${oneLine(rendered)}`
}

/**
 * The block for the code that was updated: per construct, the diff of its
 * source, then what a diff cannot say (a property that replaced an edit the
 * code had made too, a helper the file now imports).
 */
export function formatWriteBackUpdated ({ writeBack, project }: WriteBackOutputInput): string {
  const { applied, constructs, files, imports } = writeBack
  const output: string[] = [
    `${chalk.bold('Updated your code')} ${chalk.dim('·')} `
    + `${counted(applied.length, 'property', 'properties')} in ${counted(files.length, 'file', 'files')}`,
    '',
  ]
  constructs.forEach((construct, index) => {
    const lines = applied.filter(line => line.file === construct.file && sameResource(line, construct))
    output.push(header(MARKER.update, construct, construct.file, project))
    const diff = diffLines(construct.before, construct.after)
    if (diff === undefined || diff.length === 0) {
      // Too long to diff, which a construct's own source never is in
      // practice: the properties are listed with their values instead.
      output.push(...lines.map(propertyLine))
    } else {
      // A diff opens with a hunk boundary, which is shown as the gap between
      // two hunks, so the first one is left out.
      output.push(...diff.slice(1).map(line => `  ${styled(line)}`.trimEnd()))
    }
    for (const line of lines.filter(line => line.replacesLocalEdit)) {
      output.push(`  ${styled({ kind: 'note', text: `${line.property}: replaced a local edit` })}`)
    }
    // The import belongs to the file, so it is said once, under the last
    // construct of that file.
    const lastOfFile = !constructs.slice(index + 1).some(other => other.file === construct.file)
    const imported = imports.find(entry => entry.file === construct.file)
    if (lastOfFile && imported !== undefined) {
      output.push(`  ${styled({ kind: 'note', text: `imported ${imported.names.join(', ')} from 'checkly/constructs'` })}`)
    }
    output.push('')
  })
  return output.join('\n')
}

/**
 * A skipped property as the reader's code names it. A change refused before
 * it was matched to a construct property is known by the path Checkly reports
 * (`/runParallel`), which is shown dotted like the others.
 */
function propertyName (property: string): string {
  if (!property.startsWith('/')) {
    return property
  }
  try {
    return pointerSegments(property).join('.')
  } catch {
    return property
  }
}

/**
 * The block for what was not written: per resource, each property with the
 * reason, or the reason alone when it is about the whole resource.
 */
export function formatWriteBackSkipped ({ writeBack, project, cwd }: WriteBackOutputInput): string {
  const groups: { resource: WriteBackSkip, skips: WriteBackSkip[] }[] = []
  for (const skip of writeBack.skipped) {
    const group = groups.find(candidate => sameResource(candidate.resource, skip))
    if (group === undefined) {
      groups.push({ resource: skip, skips: [skip] })
    } else {
      group.skips.push(skip)
    }
  }
  const output: string[] = [`${chalk.bold('Not updated')} ${chalk.dim('·')} edit these by hand`, '']
  for (const { resource, skips } of groups) {
    const declaredIn = project.data[resource.type as keyof ProjectData]?.[resource.logicalId]?.checkFileAbsolutePath
    const file = declaredIn === undefined ? undefined : path.relative(cwd, declaredIn)
    output.push(header(MARKER.warn, resource, file, project))
    const rows = skips.map(({ property, reason }) =>
      ({ property: property === undefined ? undefined : propertyName(property), reason }))
    const width = Math.max(0, ...rows.map(row => visWidth(row.property ?? '')))
    for (const { property, reason } of rows) {
      output.push(property === undefined
        ? `    ${reason}`
        : `    ${padColumn(property, width)}  ${chalk.dim(reason)}`)
    }
    output.push('')
  }
  return output.join('\n')
}
