import { Parser } from '../../../services/check-parser/parser'

export class UnsupportedScriptError extends Error {}

export interface Snippet {
  id: number
  name: string
  script: string
}

export function isSafeSnippetFilename (name: string): boolean {
  // These are the characters the backend supports.
  return /^[\w-]+$/.test(name)
}

export function isSnippet (resource: any): resource is Snippet {
  if (typeof resource.id !== 'number') {
    return false
  }

  if (typeof resource.name !== 'string') {
    return false
  }

  if (typeof resource.script !== 'string') {
    return false
  }

  validateScript(resource.script)

  return true
}

export function snippetUsesHandlebarsSyntax (script: string): boolean {
  return script.includes('{{>') || script.includes('{{#')
}

export function validateScript (content: string) {
  if (snippetUsesHandlebarsSyntax(content)) {
    throw new UnsupportedScriptError(`Conversion from legacy handlebars syntax is not supported.`)
  }
}

const SNIPPET_PATH_PREFIX = './snippets/'

export function parseSnippetDependencies (content: string): string[] {
  const {
    module: { dependencies },
    error,
  } = Parser.parseDependencies('__placeholder.ts', content)

  if (error) {
    throw new Error(`Failed to parse '${SNIPPET_PATH_PREFIX}...' dependencies: ${error}`, { cause: error })
  }

  return dependencies
    .filter(({ importPath }) => importPath.startsWith(SNIPPET_PATH_PREFIX))
    .map(({ importPath }) => importPath.slice(SNIPPET_PATH_PREFIX.length))
}
