import * as recast from 'recast'
import path from 'node:path'
import fs from 'node:fs/promises'
import { namedTypes as n } from 'ast-types';


export function findPropertyByName (ast: any, name: string): recast.types.namedTypes.Property | undefined {
  let node
  recast.visit(ast, {
    visitProperty (path: any) {
      if (path.node.key.name === name) {
        node = path.node
      }
      return false
    },
  })
  return node
}

export function addOrReplaceItem(ast: any, node: any, name: string) {
  const item = findPropertyByName(ast, name)
  if (item) {
    item.value = node.value
  } else {
    ast.properties.push(node)
  }
}

export function addItemToArray(ast: any, node: any, name: string) {
  if (!n.ObjectExpression.check(ast)) {
    throw new Error('AST node is not an ObjectExpression');
  }

  const item = findPropertyByName(ast, name);

  if (item) {
    if (n.ArrayExpression.check(item.value)) {
      item.value.elements = item.value.elements || [];
      item.value.elements.push(node);
    } else {
      throw new Error(`Property "${name}" exists but is not an array`);
    }
  } else {
    ast.properties.push({
      type: 'Property',
      key: { type: 'Identifier', name },
      value: { type: 'ArrayExpression', elements: [node] },
      kind: 'init',
      computed: false,
      method: false,
      shorthand: false,
    });
  }
}


export async function reWriteChecklyConfigFile (data: string, fileName: string, dir: string) {
  await fs.writeFile(path.join(dir, fileName), data)
}
