import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'test-config-project',
  logicalId: 'test-config-project',
  caching: {
    dependencyCache: {
      // 0 is falsy but a perfectly valid version value; the validation must
      // accept it rather than treat it as unset.
      version: 0,
    },
  },
})

export default config
