import path from 'node:path'

type Paths = Record<string, Array<string>>

class TargetPathSpec {
  /**
   * Prefix is the part of the path before an asterisk (wildcard), or the
   * whole path if there's no asterisk.
   *
   * Examples of possible values:
   *   - `"./foo/*"` (from `"./foo/"`)
   *   - `"./bar/foo-"` (from `"./bar/foo-*.js"`)
   *   - `"./bar."` (from `"./bar.*.ts"`)
   *   - `""` (from `"*"`)
   */
  prefix: string

  /**
   * Suffix is the part of the path after the asterisk (wildcard), if any.
   */
  suffix?: string

  protected constructor (prefix: string, suffix?: string) {
    this.prefix = prefix
    this.suffix = suffix
  }

  toPath (joker?: string) {
    if (this.suffix === undefined) {
      return this.prefix
    }

    if (joker === undefined) {
      return this.prefix + this.suffix
    }

    return this.prefix + joker + this.suffix
  }

  static create (spec: string) {
    const parts = spec.split('*', 2)
    if (parts.length === 1) {
      return new TargetPathSpec(spec)
    }
    const [prefix, suffix] = parts
    return new TargetPathSpec(prefix, suffix)
  }
}

export type TargetPathResult = {
  spec: TargetPathSpec,
  path: string,
}

class PathMatchResult {
  ok: boolean
  results: TargetPathResult[]

  private constructor (ok: boolean, results: TargetPathResult[]) {
    this.ok = ok
    this.results = results
  }

  static some (results: TargetPathResult[]) {
    return new PathMatchResult(true, results)
  }

  static none () {
    return new PathMatchResult(false, [])
  }
}

interface PathMatcher {
  get prefixLength (): number
  match (importPath: string): PathMatchResult
}

class ExactPathMatcher implements PathMatcher {
  prefix: string
  target: TargetPathSpec[]

  constructor (prefix: string, target: TargetPathSpec[]) {
    this.prefix = prefix
    this.target = target
  }

  get prefixLength (): number {
    return this.prefix.length
  }

  match (importPath: string): PathMatchResult {
    if (importPath === this.prefix) {
      return PathMatchResult.some(this.target.map(target => {
        return {
          spec: target,
          path: target.toPath(),
        }
      }))
    }

    return PathMatchResult.none()
  }
}

class WildcardPathMatcher implements PathMatcher {
  prefix: string
  suffix: string
  target: TargetPathSpec[]

  constructor (prefix: string, suffix: string, target: TargetPathSpec[]) {
    this.prefix = prefix
    this.suffix = suffix
    this.target = target
  }

  get prefixLength (): number {
    return this.prefix.length
  }

  match (importPath: string): PathMatchResult {
    if (importPath.startsWith(this.prefix) && importPath.endsWith(this.suffix)) {
      const joker = importPath.substring(this.prefix.length, importPath.length - this.suffix.length)
      return PathMatchResult.some(this.target.map(target => {
        return {
          spec: target,
          path: target.toPath(joker),
        }
      }))
    }

    return PathMatchResult.none()
  }
}

class SourcePathSpec {
  /**
   * Prefix is the part of the path before an asterisk (wildcard), or the
   * whole path if there's no asterisk.
   *
   * Examples of possible values:
   *   - `"@/"` (from `"@/*"`)
   *   - `"app/foo-"` (from `"app/foo-*.js"`)
   *   - `"bar."` (from `"bar.*.ts"`)
   *   - `""` (from `"*"`)
   */
  prefix: string

  /**
   * Suffix is the part of the path after the asterisk (wildcard), if any.
   */
  suffix?: string

  protected constructor (prefix: string, suffix?: string) {
    this.prefix = prefix
    this.suffix = suffix
  }

  matcherForTarget (target: TargetPathSpec[]): PathMatcher {
    if (this.suffix === undefined) {
      return new ExactPathMatcher(this.prefix, target)
    }

    return new WildcardPathMatcher(this.prefix, this.suffix, target)
  }

  static create (spec: string) {
    const parts = spec.split('*', 2)
    if (parts.length === 1) {
      return new SourcePathSpec(spec)
    }
    const [prefix, suffix] = parts
    return new SourcePathSpec(prefix, suffix)
  }
}

type SourcePathSpecMatcher = {
  spec: SourcePathSpec,
  matcher: PathMatcher,
}

export type SourcePathResult = {
  spec: SourcePathSpec,
  path: string
}

export type PathResult = {
  source: SourcePathResult
  target: TargetPathResult
}

export type ResolveResult = PathResult[]

export class PathResolver {
  baseUrl: string
  matchers: SourcePathSpecMatcher[]

  private constructor (baseUrl: string, matchers: SourcePathSpecMatcher[]) {
    this.baseUrl = baseUrl

    // Sort by longest prefix now, then we don't have to care about it later.
    matchers.sort((a, b) => b.matcher.prefixLength - a.matcher.prefixLength)

    this.matchers = matchers
  }

  resolve (importPath: string): ResolveResult {
    for (const { spec, matcher } of this.matchers) {
      const match = matcher.match(importPath)
      if (match.ok) {
        // We can just return the first match since matchers are already
        // sorted by longest prefix.
        return match.results.map(result => {
          return {
            source: {
              spec,
              path: importPath,
            },
            target: result,
          }
        })
      }
    }

    return []
  }

  static createFromPaths (baseUrl: string, paths: Paths): PathResolver {
    const matchers: SourcePathSpecMatcher[] = []

    for (const path in paths) {
      matchers.push(PathResolver.matcherForPath(path, paths[path]))
    }

    return new PathResolver(baseUrl, matchers)
  }

  private static matcherForPath (spec: string, target: string[]): SourcePathSpecMatcher {
    const pathSpec = SourcePathSpec.create(spec)
    const matcher = pathSpec.matcherForTarget(target.map(TargetPathSpec.create))

    return {
      spec: pathSpec,
      matcher,
    }
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
