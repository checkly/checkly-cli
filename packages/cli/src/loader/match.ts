import { extname } from 'node:path'

export type FileMatchFunction = (filePath: string) => boolean

export class FileMatch {
  match: FileMatchFunction

  protected constructor (match: FileMatchFunction) {
    this.match = match
  }

  complement (): FileMatch {
    return new FileMatch(filePath => !this.match(filePath))
  }

  union (matcher: FileMatch): FileMatch {
    return new FileMatch(filePath => {
      return this.match(filePath) || matcher.match(filePath)
    })
  }

  intersection (matcher: FileMatch): FileMatch {
    return new FileMatch(filePath => {
      return this.match(filePath) && matcher.match(filePath)
    })
  }

  difference (matcher: FileMatch): FileMatch {
    return this.intersection(matcher.complement())
  }

  static none (): FileMatch {
    return new FileMatch(() => false)
  }

  static any (): FileMatch {
    return new FileMatch(() => true)
  }

  static pattern (pattern: RegExp): FileMatch {
    return new FileMatch(filePath => pattern.test(filePath))
  }

  static extension (...extensions: string[]): FileMatch {
    const set = new Set(extensions)
    return new FileMatch(filePath => set.has(extname(filePath)))
  }

  static custom (match: FileMatchFunction): FileMatch {
    return new FileMatch(match)
  }

  static standardFiles (): FileMatch {
    return FileMatch.extension('.js', '.mjs', '.cjs', '.json')
  }
}
