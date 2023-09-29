import { Project, Session } from '../project'
import { MultiStepCheck } from '../multistep-check'

describe('MultistepCheck', () => {
  it('should report multistep as check type', () => {
    Session.project = new Project('project-id', {
      name: 'Test Project',
      repoUrl: 'https://github.com/checkly/checkly-cli',
    })
    const check = new MultiStepCheck('main-check', {
      name: 'Main Check',
      code: { content: '' },
    })
    expect(check.synthesize()).toMatchObject({ checkType: 'MULTI_STEP' })
  })
})
