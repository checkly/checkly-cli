import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'empty script project',
  logicalId: 'empty-script-project-id',
  repoUrl: 'https://github.com/checkly/checkly-cli',
})

export default config
