const Joi = require('joi')

const {
  alertChannelSubscriptionListSchema,
  alertSettingsSchema,
} = require('./alerts')

const {
  keyValueSchema,
  assertionListSchema,
  basicAuthSchema,
  envVarListSchema,
  validRegions,
  tagListSchema,
  availableRuntimes,
} = require('./common')

const groupApiCheckDefaultsSchema = {
  url: Joi.string()
    .optional()
    .allow(null)
    .allow('')
    .default('')
    .description(
      'The base url for this group which you can reference with the {{GROUP_BASE_URL}} variable in all group checks.'
    ),

  headers: Joi.array().items(keyValueSchema).default([]),
  queryParameters: Joi.array().items(keyValueSchema).default([]),
  assertions: assertionListSchema,
  basicAuth: basicAuthSchema,
}

const groupLocationListSchema = Joi.array()
  .items(Joi.string().valid(...validRegions))
  .min(1)
  .required()
  .default(['us-east-1'])
  .description(
    'An array of one or more data center locations where to run the checks'
  )

const groupAPICheckDefaultsSchema = Joi.object()
  .keys({ ...groupApiCheckDefaultsSchema })
  .optional()
  .default({})

const groupBrowserCheckDefaultsSchema = Joi.object()
  .keys({})
  .optional()
  .default({})

const groupSchema = Joi.object()
  .keys({
    name: Joi.string().required().description('The name of the check group'),

    activated: Joi.boolean()
      .default(true)
      .description('Determines if the checks in the  group are running or not'),
    muted: Joi.boolean()
      .optional()
      .default(false)
      .description(
        'Determines if any notifications will be send out when a check in this group fails and/or recovers'
      ),

    tags: tagListSchema,
    locations: groupLocationListSchema,

    concurrency: Joi.number()
      .positive()
      .optional()
      .default(3)
      .min(1)
      .description(
        'Determines how many checks are invoked concurrently when triggering a check group from CI/CD or through the API.'
      ),

    apiCheckDefaults: groupAPICheckDefaultsSchema,
    browserCheckDefaults: groupBrowserCheckDefaultsSchema,

    runtimeId: Joi.string()
      .valid(...availableRuntimes)
      .allow(null)
      .default(null)
      .optional()
      .description(
        'The runtime version, i.e. fixed set of runtime dependencies, used to execute checks in this group.'
      ),

    environmentVariables: envVarListSchema.optional().allow(null),
    doubleCheck: Joi.boolean()
      .optional()
      .default(true)
      .description(
        'Setting this to "true" will trigger a retry when a check fails from the failing region and another, randomly selected region before marking the check as failed'
      ),

    useGlobalAlertSettings: Joi.boolean()
      .optional()
      .default(true)
      .description(
        'When true, the account level alert setting will be used, not the alert setting defined on this check group'
      ),

    alertSettings: alertSettingsSchema,
    alertChannelSubscriptions: alertChannelSubscriptionListSchema,

    setupSnippetId: Joi.number()
      .allow(null)
      .default(null)
      .optional()
      .description(
        'An ID reference to a snippet to use in the setup phase of an API check in this group'
      ),

    tearDownSnippetId: Joi.number()
      .allow(null)
      .default(null)
      .optional()
      .description(
        'An ID reference to a snippet to use in the teardown phase of an API check in this group'
      ),

    localSetupScript: Joi.string()
      .allow(null)
      .allow('')
      .optional()
      .default(null)
      .description(
        'A valid piece of Node.js code to run in the setup phase of an API check in this group'
      ),

    localTearDownScript: Joi.string()
      .allow(null)
      .allow('')
      .optional()
      .default(null)
      .description(
        'A valid piece of Node.js code to run in the teardown phase of an API check in this group'
      ),
  })
  .options({ stripUnknown: { objects: true, arrays: true } })

module.exports = {
  groupSchema,
}
