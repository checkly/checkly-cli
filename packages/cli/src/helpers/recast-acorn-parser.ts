import * as acorn from 'acorn'

export function parse (source: string) {
  const comments: acorn.Comment[] = []
  const tokens: acorn.Token[] = []
  const ast = acorn.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    locations: true,
    allowImportExportEverywhere: true,
    allowReturnOutsideFunction: true,
    onComment: comments,
    onToken: tokens,
  })
  if (!(ast as any).comments) {
    (ast as any).comments = comments
  }
  if (!(ast as any).tokens) {
    (ast as any).tokens = tokens
  }
  return ast
}
