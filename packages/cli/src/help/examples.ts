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
]
export default examples
