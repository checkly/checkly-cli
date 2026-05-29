type Example = {
  description: string
  command: string
}

const examples: Array<Example> = [
  {
    description: 'Run your checks on Checkly with full logs, traces and videos.',
    command: 'npx checkly test',
  },
  {
    description: 'Pass environment variables to your checks.',
    command: 'npx checkly test -e SECRET=my-password',
  },
  {
    description: 'Deploy your project to your Checkly account.',
    command: 'npx checkly deploy',
  },
  {
    description: 'Make an authenticated API request to any endpoint.',
    command: 'npx checkly api /v1/checks',
  },
]
export default examples
