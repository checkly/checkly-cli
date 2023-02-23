import * as groupResources from './group-dir/group-definition'
import * as checkResources from './check-dir/check-definition'

// This is needed to avoid the imports from being optimized away
if (!groupResources || !checkResources) {
  throw new Error('Failed to import resources')
}
