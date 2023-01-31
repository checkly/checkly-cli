import { add } from './dep1'
import { subtract as random } from './dep4'
import { subtract } from './dep2'
import * as axios from 'axios'

export function doMath (num: number): number {
  return add(num, subtract(10, 7))
}
