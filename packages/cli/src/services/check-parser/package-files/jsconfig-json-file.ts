import path from 'node:path'

import { TSConfigFile, Options, Schema } from './tsconfig-json-file'
import { JsonSourceFile } from './json-source-file'

/**
 * JSConfigFile is essentially the exact same as TSConfigFile but with
 * allowJs implicitly enabled.
 *
 * While we could handle jsconfig.json with just TSConfigFile, it's not that
 * much extra trouble to have a separate wrapper for it and doing it this way
 * may enable some interesting features later.
 */
export class JSConfigFile extends TSConfigFile {
  static FILENAME = 'jsconfig.json'

  static filePath (dirPath: string) {
    return path.join(dirPath, JSConfigFile.FILENAME)
  }

  static loadFromJsonSourceFile (jsonFile: JsonSourceFile<Schema>): JSConfigFile | undefined {
    return new JSConfigFile(jsonFile)
  }

  static loadFromFilePath (filePath: string, options?: Options): JSConfigFile | undefined {
    const { jsonSourceFileLoader } = {
      jsonSourceFileLoader: JsonSourceFile.loadFromFilePath<Schema>,
      ...options,
    }

    const jsonFile = jsonSourceFileLoader(filePath)
    if (jsonFile === undefined) {
      return
    }

    return new JSConfigFile(jsonFile)
  }
}
