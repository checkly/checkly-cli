const fs = require('fs')
const yaml = require('yaml')
const assert = require('assert')

const { checkSchema } = require('../../src/schemas/checks')

describe('api check [schema]', () => {
  it('should return a valid api check schema', () => {
    const check = fs.readFileSync(
      './test/fixtures/yml/api-check-valid.yml',
      'utf8'
    )
    const parsedCheck = yaml.parse(check)
    const schema = checkSchema.validate(parsedCheck)

    assert.equal(schema.error, undefined)
  })

  it('should return an error api check schema', () => {
    const check = fs.readFileSync(
      './test/fixtures/yml/api-check-invalid.yml',
      'utf8'
    )
    const parsedCheck = yaml.parse(check)
    const schema = checkSchema.validate(parsedCheck)

    assert.equal(schema.error.details.length, 1)
    assert.equal(schema.error.details[0].message, '"name" is required')
  })
})
