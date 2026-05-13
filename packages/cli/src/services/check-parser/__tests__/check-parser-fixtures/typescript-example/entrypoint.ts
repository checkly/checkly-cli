import { add } from './dep1.js'
import { subtract as random } from './dep4'
import { subtract } from './dep2.js'
import * as axios from 'axios'
import type { UniqueType } from './type.js'
import * as moduleImport from './module/index.js'
import * as modulePackage from './module-package'
import { ExternalFirstPage } from './pages/external.first.page.js'
import { ExternalSecondPage } from './pages/external.second.page.js'
export { value } from './dep5.js' // named export

export function doMath (num: number): number {
  return add(num, subtract(10, 7))
}
