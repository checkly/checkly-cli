const fs = require('fs')
const yaml = require('yaml')
const assert = require('assert')

const { projectSchema } = require('../../src/schemas/project')

describe('project [schema]', () => {
  it('should return a valid api project schema', () => {
    const project = fs.readFileSync(
      './test/fixtures/yml/project-valid.yml',
      'utf8'
    )
    const parsedProject = yaml.parse(project)
    const schema = projectSchema.validate(parsedProject)

    assert.equal(schema.error, undefined)
  })

  it('should return an error api project schema', () => {
    const project = fs.readFileSync(
      './test/fixtures/yml/project-invalid.yml',
      'utf8'
    )
    const parsedProject = yaml.parse(project)
    const schema = projectSchema.validate(parsedProject)

    assert.equal(schema.error.details.length, 1)
    assert.equal(schema.error.details[0].message, '"projectId" is required')
  })
})
