export type LoadFile<T> = (filePath: string) => Promise<T | undefined>

export class FileLoader<T> {
  loader: LoadFile<T>
  cache = new Map<string, T | undefined>()

  constructor (loader: LoadFile<T>) {
    this.loader = loader
  }

  async load (filePath: string): Promise<T | undefined> {
    if (this.cache.has(filePath)) {
      return this.cache.get(filePath)
    }
    const file = await this.loader(filePath)
    this.cache.set(filePath, file)
    return file
  }
}
