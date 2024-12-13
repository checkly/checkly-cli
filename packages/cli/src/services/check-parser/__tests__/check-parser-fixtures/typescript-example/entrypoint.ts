import { add } from './dep1'
import { subtract as random } from './dep4'
import { subtract } from './dep2'
import * as axios from 'axios'
import type { UniqueType } from './type'
import * as moduleImport from './module'
import * as modulePackage from './module-package'
import { ExternalFirstPage } from './pages/external.first.page.js'
import { ExternalSecondPage } from './pages/external.second.page'
export { value } from './dep5' // named export

export function doMath (num: number): number {
  return add(num, subtract(10, 7))
}
