export function filterByCheckNamePattern (checkNamePattern = '', checkName: string) {
  const re = new RegExp(checkNamePattern)
  return re.test(checkName)
}

export function filterByFileNamePattern (filePatterns: Array<string> = [], path: string | undefined) {
  return !!filePatterns.find(filePattern => {
    const re = new RegExp(filePattern)
    return re.test(path as any)
  })
}

/** The files a check can be selected by with `checkly test <file>`. */
export interface CheckFiles {
  /** The file that declares the check, relative to the parse directory. */
  sourceFile?: string
  /**
   * The check file that was being loaded when the check was created,
   * relative to the parse directory; differs from `sourceFile` when a
   * module the check file imports, or a helper it calls, declares the check.
   */
  loadedFrom?: string
  /** A browser or multistep check's script, relative to the base path. */
  entrypoint?: string
}

/**
 * Whether one of the file patterns names the check: by the file that
 * declares it, by the check file that loaded it, or by its script.
 */
export function filterByCheckFiles (filePatterns: Array<string> = [], files: CheckFiles): boolean {
  // A file that is unknown is not matched by anything, not even a pattern
  // that happens to match the word "undefined".
  return [files.entrypoint, files.sourceFile, files.loadedFrom]
    .some(file => file !== undefined && filterByFileNamePattern(filePatterns, file))
}

export function filterByTags (targetTags: string[][], tags: string[] | undefined): boolean {
  if (targetTags?.length > 0 && tags) {
    return targetTags.some(targetTagSet => {
      return targetTagSet.every(tag => tags.includes(tag))
    })
  } else {
    return true
  }
}
