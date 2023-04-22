type Example = {
  description: string,
  command: string
}

const examples: Array<Example> = [
  {
    description: 'Test your checks on Checkly with full logging.',
    command: 'npx checkly test -v',
  },
  {
    description: 'Pass environment variables to your checks.',
    command: 'npx checkly test -e SECRET=my-password',
  },
  {
    description: 'Record your test session in Checkly with logs, traces and videos.',
    command: 'npx checkly test --record',
  },
  {
    description: 'Deploy your project to your Checkly account.',
    command: 'npx checkly deploy',
  },
]
export default examples
