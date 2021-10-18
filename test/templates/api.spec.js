const yaml = require('yaml')
const assert = require('assert')

const { checkSchema } = require('../../src/schemas/check')
const { basic, advanced } = require('../../src/templates/api')

describe('api check [templates]', () => {
  it('should be valid api check basic template', () => {
    const template = yaml.parse(basic())
    const schema = checkSchema.validate(template)
    assert.equal(schema.error, undefined)
  })

  it('should be valid api check advanced template', () => {
    const template = yaml.parse(advanced())
    const schema = checkSchema.validate(template)
    assert.equal(schema.error, undefined)
  })
})
