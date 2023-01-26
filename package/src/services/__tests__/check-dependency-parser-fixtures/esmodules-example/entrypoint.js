export { value } from './dep1'
import dep2 from './dep2'
import { dep3 } from './dep3'

console.log('Received ', dep2, dep3)
