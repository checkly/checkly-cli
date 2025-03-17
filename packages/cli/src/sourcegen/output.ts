class File {
  #chunks: string[] = []

  append (data: string) {
    this.#chunks.push(data)
  }

  finalize (): string {
    return this.#chunks.join('')
  }
}

class Line {
  #level: number
  #chunks: string[] = []

  constructor (level: number) {
    this.#level = level
  }

  get level () {
    return this.#level
  }

  isEmpty (): boolean {
    return this.#chunks.length === 0
  }

  append (value: string) {
    this.#chunks.push(value)
  }

  appendTo (file: File) {
    file.append('  '.repeat(this.#level))
    file.append(this.#chunks.join(''))
  }
}

export class Output {
  #level = 0
  #lines: Line[] = []
  #currentLine: Line

  constructor (level = 0) {
    this.#level = level
    this.#currentLine = new Line(this.#level)
  }

  increaseIndent () {
    this.#level += 1
  }

  decreaseIndent () {
    this.#level -= 1
  }

  beginLine () {
    this.#currentLine = new Line(this.#level)
    this.#lines.push(this.#currentLine)
  }

  append (value: string) {
    this.#currentLine.append(value)
  }

  significantWhitespace () {
    this.append(' ')
  }

  cosmeticWhitespace () {
    this.append(' ')
  }
}
