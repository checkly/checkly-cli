const yaml = require('yaml')
const assert = require('assert')

const { projectSchema } = require('../../src/schemas/project')
const template = require('../../src/templates/project')

describe('project [templates]', () => {
  it('should be valid project template', () => {
    const schema = projectSchema.validate(
      yaml.parse(template({ projectId: 1, projectName: 'test-project' }))
    )
    assert.equal(schema.error, undefined)
  })
})
