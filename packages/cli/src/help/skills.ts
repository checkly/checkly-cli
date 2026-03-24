type Skill = {
  command: string
  description: string
}

export const skillsDescription = 'The CLI provides product documentation and agent workflows via the `npx checkly skills` command.\n'

export const skills: Array<Skill> = [
  {
    command: 'npx checkly skills install',
    description: 'Install the Checkly agent skill into your project',
  },
  {
    command: 'npx checkly skills',
    description: 'Show available documentation and workflows',
  },
  {
    command: 'npx checkly skills configure',
    description: 'Show general configuration reference',
  },
  {
    command: 'npx checkly skills configure api-checks',
    description: 'Show API Checks configuration reference',
  },
]
