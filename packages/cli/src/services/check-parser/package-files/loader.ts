export type LoadFile<T> = (filePath: string) => T | undefined

export class FileLoader<T> {
  loader: LoadFile<T>
  cache = new Map<string, T | undefined>()

  constructor (loader: LoadFile<T>) {
    this.loader = loader
  }

  load (filePath: string): T | undefined {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)
    }
    const file = this.loader(filePath)
    this.cache.set(filePath, file)
    return file
  }
}
