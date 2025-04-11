class OutputBuffer {
  #chunks: string[] = []

  append (data: string) {
    this.#chunks.push(data)
  }

  finalize (): string {
    return this.#chunks.join('')
  }
}

class OutputLine {
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

  collect (buf: OutputBuffer) {
    buf.append('  '.repeat(this.#level))
    buf.append(this.#chunks.join(''))
    buf.append('\n')
  }
}

export class Output {
  #level = 0
  #lines: OutputLine[] = []
  #currentLine: OutputLine

  constructor (level = 0) {
    this.#level = level
    this.#currentLine = new OutputLine(this.#level)
    this.#lines.push(this.#currentLine)
  }

  increaseIndent () {
    this.#level += 1
  }

  decreaseIndent () {
    this.#level -= 1
  }

  endLine () {
    this.#currentLine = new OutputLine(this.#level)
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

  finalize (): string {
    // Remove trailing empty lines.
    for (;;) {
      const line = this.#lines.pop()
      if (line === undefined) {
        break
      }

      if (!line.isEmpty()) {
        this.#lines.push(line)
        break
      }
    }

    const buf = new OutputBuffer()

    for (const line of this.#lines) {
      line.collect(buf)
    }

    return buf.finalize()
  }
}
