import dep2 from './dep2'
import { dep3 } from './dep3'
export { value } from './dep1'
export { dep4 } from './dep4.mjs'

/* eslint-disable no-console */
console.log('Received ', dep2, dep3)
