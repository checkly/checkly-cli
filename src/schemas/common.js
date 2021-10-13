const Joi = require('joi')
const locations = require('./locations')

const REQUEST_URL_MAX_LENGTH = 2048
const escalationTypes = {
  RUN_BASED: 'RUN_BASED',
  TIME_BASED: 'TIME_BASED',
}
const checkTypes = ['BROWSER', 'API']
const assertionSources = [
  'STATUS_CODE',
  'JSON_BODY',
  'HEADERS',
  'TEXT_BODY',
  'RESPONSE_TIME',
]
const assertionComparisons = [
  'EQUALS',
  'NOT_EQUALS',
  'HAS_KEY',
  'NOT_HAS_KEY',
  'HAS_VALUE',
  'NOT_HAS_VALUE',
  'IS_EMPTY',
  'NOT_EMPTY',
  'GREATER_THAN',
  'LESS_THAN',
  'CONTAINS',
  'NOT_CONTAINS',
  'IS_NULL',
  'NOT_NULL',
]
const httpMethods = ['GET', 'POST', 'PUT', 'HEAD', 'DELETE', 'PATCH']
const validRegions = Object.keys(locations)
const apiSchedules = [0, 1, 5, 10, 15, 30, 60, 720, 1440]
const browserSchedules = [1, 5, 10, 15, 30, 60, 720, 1440]
const secondSchedules = [10, 20, 30]

const keyValueSchema = Joi.object()
  .keys({
    key: Joi.string().required(),
    value: Joi.string().required().allow('').default(''),
    locked: Joi.boolean().optional().default(false),
  })
  .label('KeyValue')

const headersListSchema = Joi.array()
  .items(keyValueSchema)
  .default([])
  .label('HeaderList')

const queryParameterListSchema = Joi.array()
  .items(keyValueSchema)
  .default([])
  .label('QueryParameterList')

const assertionSchema = Joi.object()
  .keys({
    source: Joi.string()
      .valid(...assertionSources)
      .label('AssertionSource'),

    property: Joi.string().default('').allow('').label('AssertionProperty'),

    comparison: Joi.string()
      .valid(...assertionComparisons)
      .label('AssertionComparison'),

    target: Joi.string().default('').allow('').label('AssertionTarget'),
  })
  .options({ stripUnknown: { objects: true, arrays: true } })
  .label('Assertion')

const assertionListSchema = Joi.array()
  .items(assertionSchema)
  .optional()
  .default([])
  .description(
    'Check the main Checkly documentation on assertions for specific values like regular expressions and JSON path descriptors you can use in the "property" field.'
  )
  .label('AssertionList')

const basicAuthSchema = Joi.object()
  .optional()
  .allow(null)
  .keys({
    username: Joi.string().default('').allow('').required(),
    password: Joi.string().default('').allow('').required(),
  })
  .label('BasicAuth')

const requestSchema = Joi.object()
  .keys({
    method: Joi.string()
      .valid(...httpMethods)
      .required()
      .default('GET'),

    url: Joi.string()
      .required()
      .max(REQUEST_URL_MAX_LENGTH)
      .default('localhost'),

    followRedirects: Joi.boolean().optional(),

    body: Joi.string().optional().allow('').default(''),

    bodyType: Joi.string()
      .valid('JSON', 'FORM', 'RAW', 'GRAPHQL', 'NONE')
      .optional()
      .default('NONE'),

    headers: headersListSchema,
    queryParameters: queryParameterListSchema,
    assertions: assertionListSchema,
    basicAuth: basicAuthSchema,
  })
  .options({ stripUnknown: { arrays: false, objects: true } })
  .label('Request')

const envVarSchema = Joi.object()
  .keys({
    key: Joi.string().required(),
    value: Joi.string().required().default(''),

    locked: Joi.boolean()
      .optional()
      .default(false)
      .description('Used only in the UI to hide the value like a password '),
  })
  .label('EnvironmentVariable')

const envVarListSchema = Joi.array()
  .items(envVarSchema)
  .label('EnvironmentVariableList')

module.exports = {
  keyValueSchema,
  headersListSchema,
  queryParameterListSchema,
  requestSchema,
  checkTypes,
  escalationTypes,
  validRegions,
  apiSchedules,
  browserSchedules,
  secondSchedules,
  envVarListSchema,
  envVarSchema,
}
