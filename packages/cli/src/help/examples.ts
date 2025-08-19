type Example = {
  description: string
  command: string
}

const examples: Array<Example> = [
  {
    description: 'Record your test session in Checkly with logs, traces and videos.',
    command: 'npx checkly test --record',
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
