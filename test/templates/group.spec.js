const yaml = require('yaml')
const assert = require('assert')

const { groupSchema } = require('../../src/schemas/groups')
const template = require('../../src/templates/group')

describe('group [templates]', () => {
  it('should be valid group template', () => {
    const schema = groupSchema.validate(yaml.parse(template()))
    assert.equal(schema.error, undefined)
  })
})
