export function filterByCheckNamePattern (checkNamePattern = '', checkName: string) {
  const re = new RegExp(checkNamePattern)
  return re.test(checkName)
}

export function filterByFileNamePattern (filePatterns: Array<string> = [], path: string|undefined) {
  return !!filePatterns.find(filePattern => {
    const re = new RegExp(filePattern)
    return re.test(path as any)
  })
}

export function filterByTags (targetTags: string[][], tags: string[]|undefined): boolean {
  if (targetTags?.length > 0 && tags) {
    return targetTags.some(targetTagSet => {
      return targetTagSet.every(tag => tags.includes(tag))
    })
  } else {
    return true
  }
}
