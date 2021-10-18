const fs = require('fs')
const yaml = require('yaml')
const assert = require('assert')

const { checkGroupSchema } = require('../../src/schemas/groups')

describe('group [schema]', () => {
  it('should return a valid group schema', () => {
    const group = fs.readFileSync('./test/fixtures/yml/group-valid.yml', 'utf8')
    const parsedGroup = yaml.parse(group)
    const schema = checkGroupSchema.validate(parsedGroup)

    assert.equal(schema.error, undefined)
  })

  it('should return an error group schema', () => {
    const group = fs.readFileSync(
      './test/fixtures/yml/group-invalid.yml',
      'utf8'
    )
    const parsedGroup = yaml.parse(group)
    const schema = checkGroupSchema.validate(parsedGroup)

    assert.equal(schema.error.details.length, 1)
    assert.equal(schema.error.details[0].message, '"locations" is required')
  })
})
