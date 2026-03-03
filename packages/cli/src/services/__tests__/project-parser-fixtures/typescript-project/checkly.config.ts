import { defineConfig } from 'checkly'

const config = defineConfig({
  projectName: 'ts project',
  logicalId: 'ts-project-id',
  repoUrl: 'https://github.com/checkly/checkly-cli',
})

export default config
