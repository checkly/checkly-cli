const yaml = require('yaml')
const assert = require('assert')

const { checkGroupSchema } = require('../../src/schemas/groups')
const template = require('../../src/templates/group')

describe('group [templates]', () => {
  it('should be valid group template', () => {
    const schema = checkGroupSchema.validate(yaml.parse(template()))
    assert.equal(schema.error, undefined)
  })
})
