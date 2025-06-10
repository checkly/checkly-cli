import { MixedFileLoader, NativeFileLoader, JitiFileLoader, TSNodeFileLoader } from '../loader'

const loader = new MixedFileLoader(
  new NativeFileLoader(),
  new JitiFileLoader(),
  new TSNodeFileLoader(),
)

export async function loadFile (filePath: string): Promise<any> {
  if (!loader.isAuthoritativeFor(filePath)) {
    throw new Error(`Unable to find a compatible loader for file '${filePath}'`)
  }

  try {
    const moduleExports = await loader.loadFile<Record<string, any>>(filePath)

    const defaultExport = moduleExports?.default ?? moduleExports
    if (typeof defaultExport === 'function') {
      return await defaultExport()
    }

    return defaultExport
  } catch (err: any) {
    throw new Error(`Error loading file '${filePath}'\n${err.stack}`)
  }
}
