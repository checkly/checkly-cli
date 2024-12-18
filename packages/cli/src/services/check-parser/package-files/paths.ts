import path from 'node:path'

type Paths = Record<string, Array<string>>

class PathMatch {
  ok: boolean
  results: string[]

  private constructor (ok: boolean, results: string[]) {
    this.ok = ok
    this.results = results
  }

  static some (results: string[]) {
    return new PathMatch(true, results)
  }

  static none () {
    return new PathMatch(false, [])
  }
}

interface PathMatcher {
  get prefixLength (): number
  match (importPath: string): PathMatch
}

class ExactPathMatcher implements PathMatcher {
  source: string
  target: string[]

  constructor (source: string, target: string[]) {
    this.source = source
    this.target = target
  }

  get prefixLength (): number {
    return this.source.length
  }

  match (importPath: string): PathMatch {
    if (importPath === this.source) {
      return PathMatch.some(this.target)
    }

    return PathMatch.none()
  }
}

class WildcardPathMatcher implements PathMatcher {
  prefix: string
  suffix: string
  target: string[]

  constructor (prefix: string, suffix: string, target: string[]) {
    this.prefix = prefix
    this.suffix = suffix
    this.target = target
  }

  get prefixLength (): number {
    return this.prefix.length
  }

  match (importPath: string): PathMatch {
    if (importPath.startsWith(this.prefix) && importPath.endsWith(this.suffix)) {
      const joker = importPath.substring(this.prefix.length, importPath.length - this.suffix.length)
      return PathMatch.some(this.target.map(target => target.replace('*', joker)))
    }

    return PathMatch.none()
  }
}

class AnyMatcher implements PathMatcher {
  get prefixLength (): number {
    return 0
  }

  match (importPath: string): PathMatch {
    return PathMatch.some([importPath])
  }
}

export class PathResolver {
  baseUrl: string
  matchers: PathMatcher[]

  constructor (baseUrl: string, matchers: PathMatcher[]) {
    this.baseUrl = baseUrl

    // Sort by longest prefix now, then we don't have to care about it later.
    matchers.sort((a, b) => b.prefixLength - a.prefixLength)

    this.matchers = matchers
  }

  resolve (importPath: string): string[] {
    for (const matcher of this.matchers) {
      const match = matcher.match(importPath)
      if (match.ok) {
        // We can just return the first match since matchers are already
        // sorted by longest prefix.
        return match.results.map(resultPath => path.join(this.baseUrl, resultPath))
      }
    }

    return []
  }

  static createFromPaths (baseUrl: string, paths: Paths): PathResolver {
    const matchers: PathMatcher[] = []

    for (const path in paths) {
      matchers.push(PathResolver.matcherForPath(path, paths[path]))
    }

    return new PathResolver(baseUrl, matchers)
  }

  private static matcherForPath (importPath: string, target: string[]): PathMatcher {
    const parts = importPath.split('*', 2)
    if (parts.length === 1) {
      return new ExactPathMatcher(importPath, target)
    }
    const [prefix, suffix] = parts
    return new WildcardPathMatcher(prefix, suffix, target)
  }
}

export function isLocalPath (importPath: string) {
  if (importPath.startsWith('/')) {
    return true
  }

  if (importPath.startsWith('./')) {
    return true
  }

  if (importPath.startsWith('../')) {
    return true
  }

  return false
}
