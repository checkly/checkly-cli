import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'project name',
  logicalId: 'project-id',
  repoUrl: 'https://github.com/checkly/checkly-cli',
})

export default config
