/* eslint-disable no-global-assign */
/* eslint-disable no-console */
require = (dependency) => console.log('Ignoring call to require ', dependency)

// Since we've reassigned `require`, this will just trigger a console.log().
require('./does-not-exist.js')
