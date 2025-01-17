import { PackageJsonFile } from './package-json-file'
import { CoreExtension, FileExtPath, tsCoreExtensionLookupOrder, TSExtension, tsExtensionLookupOrder } from './extension'

type Options = {
  plainJs?: boolean
  allowImportingTsExtensions?: boolean
}

export class LookupContext {
  #plainJs: boolean
  #allowImportingTsExtensions: boolean

  constructor (options: Options) {
    this.#plainJs = options.plainJs ?? false
    this.#allowImportingTsExtensions = options.allowImportingTsExtensions ?? false
  }

  static forFilePath (filePath: string, options?: Options) {
    return new LookupContext({
      plainJs: FileExtPath.fromFilePath(filePath).hasCoreExtension(),
      allowImportingTsExtensions: options?.allowImportingTsExtensions,
    })
  }

  switch (options: Options) {
    return new LookupContext({
      plainJs: options.plainJs ?? this.#plainJs,
      allowImportingTsExtensions: options.allowImportingTsExtensions ?? this.#allowImportingTsExtensions,
    })
  }

  collectLookupPaths (filePath: string): string[] {
    const extPath = FileExtPath.fromFilePath(filePath)

    if (this.#plainJs) {
      if (extPath.hasCoreExtension()) {
        return [extPath.self()]
      }

      return this.extlessCoreLookupPaths(extPath)
    }

    if (extPath.hasCoreExtension()) {
      const extensions = tsCoreExtensionLookupOrder[extPath.ext as CoreExtension]
      return extensions.map(ext => extPath.replaceExt(ext))
    }

    if (this.#allowImportingTsExtensions) {
      if (extPath.hasTypeScriptExtension()) {
        const extensions = tsExtensionLookupOrder[extPath.ext as TSExtension]
        return extensions.map(ext => extPath.replaceExt(ext))
      }
    }

    return this.extlessTSLookupPaths(extPath)
  }

  private extlessCoreLookupPaths (extPath: FileExtPath): string[] {
    return [
      extPath.appendExt('.js'),
      extPath.appendExt('.mjs'),
      extPath.appendExt('.cjs'),
      extPath.appendExt('.json'),
      extPath.resolve(PackageJsonFile.FILENAME),
      extPath.resolve('index.js'),
      extPath.resolve('index.mjs'),
      extPath.resolve('index.cjs'),
    ]
  }

  private extlessTSLookupPaths (extPath: FileExtPath): string[] {
    return this.extlessCoreLookupPaths(extPath).flatMap(filePath => {
      const extPath = FileExtPath.fromFilePath(filePath)
      const extensions = tsCoreExtensionLookupOrder[extPath.ext as CoreExtension]
      return extensions.map(ext => extPath.replaceExt(ext))
    })
  }
}
