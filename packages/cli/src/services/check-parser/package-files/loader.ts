export type LoadFile<T> = (filePath: string) => Promise<T | undefined>

export class FileLoader<T> {
  loader: LoadFile<T>
  cache = new Map<string, Promise<T | undefined>>()

  constructor (loader: LoadFile<T>) {
    this.loader = loader
  }

  async load (filePath: string): Promise<T | undefined> {
    const cached = this.cache.get(filePath)
    if (cached !== undefined) {
      return await cached
    }
    // Cache the in-flight promise rather than the resolved value so that
    // concurrent callers for the same path share a single load. When many
    // checks bundle in parallel they request the same files at once; caching
    // only the resolved value lets every caller miss the cache and redo the
    // read, multiplying peak memory by the number of concurrent checks.
    // The promise is cached even when it rejects, so failures are computed
    // once too and shared by every caller.
    const promise = this.loader(filePath)
    this.cache.set(filePath, promise)
    return await promise
  }
}
