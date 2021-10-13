const Joi = require('joi')

const {
  headersListSchema,
  queryParameterListSchema,
  requestSchema,
  checkTypes,
  validRegions,
  browserSchedules,
  apiSchedules,
  secondSchedules,
  envVarSchema,
} = require('./common')

const {
  alertChannelSubscriptionListCreateSchema,
  alertSettingsSchema,
} = require('./alerts')

const runtimes = require('./runtimes')

const availableRuntimes = runtimes.versions.map((runtime) => {
  return runtime.name
})

const customFrequencyOffsetValidator = (frequencyOffset, helper) => {
  const frequency = helper.state.ancestors[0].frequency
  const frequencyOffsetLimitSub60 = Math.floor(frequency * 10)
  const frequencyOffsetLimitOver60 = Math.ceil(frequency / 60)

  if (frequency === 0 && !secondSchedules.includes(frequencyOffset)) {
    return helper.message(
      `"frequencyOffset" must be one of [${[...secondSchedules]}]`
    )
  }

  if (
    frequency > 0 &&
    frequency <= 60 &&
    frequencyOffset > frequencyOffsetLimitSub60
  ) {
    return helper.message(
      `Frequency offset cannot be larger than ${frequencyOffsetLimitSub60}`
    )
  }

  if (frequency > 60 && frequencyOffset > frequencyOffsetLimitOver60) {
    return helper.message(
      `Frequency offset cannot be larger than ${frequencyOffsetLimitOver60}`
    )
  }

  return frequencyOffset
}

const alertEmailSchema = Joi.object()
  .keys({ address: Joi.string().required().default('') })
  .label('CheckAlertEmail')

const webhookSchema = Joi.object()
  .keys({
    name: Joi.string().optional().default(''),
    url: Joi.string().required().default(''),

    method: Joi.string()
      .allow(null, 'GET', 'POST', 'PUT', 'HEAD', 'DELETE', 'PATCH')
      .default('POST'),

    headers: headersListSchema,
    queryParameters: queryParameterListSchema,
  })
  .label('CheckAlertWebhook')

const alertSlackSchema = Joi.object()
  .keys({ url: Joi.string().required().default('') })
  .label('CheckAlertSlack')

const alertSmsSchema = Joi.object()
  .keys({
    number: Joi.string().required().default(''),
    name: Joi.string().required().allow(''),
  })
  .label('CheckAlertSMS')

const alertChannelsSchema = Joi.object()
  .keys({
    email: Joi.array().items(alertEmailSchema).label('CheckAlertEmailList'),
    webhook: Joi.array().items(webhookSchema).label('CheckAlertWebhookList'),
    slack: Joi.array().items(alertSlackSchema).label('CheckAlertSlackList'),
    sms: Joi.array().items(alertSmsSchema).label('CheckAlertSMSList'),
  })
  .options({ stripUnknown: { objects: true, arrays: true } })
  .label('CheckAlertChannels')

const alertChannelSubscription = Joi.object()
  .keys({
    alertChannelId: Joi.number().required(),
    activated: Joi.boolean().required().default(true),
  })
  .options({ stripUnknown: { objects: true, arrays: true } })
  .label('CheckAlertChannelSubscription')

const alertChannelSubscriptionList = Joi.array()
  .items(alertChannelSubscription)
  .label('CheckAlertChannelSubscriptionList')

const checkTagListSchema = Joi.array()
  .items(Joi.string())
  .optional()
  .description('Tags for organizing and filtering checks')
  .label('CheckTagList')

const locationListSchema = Joi.array()
  .items(Joi.string().valid(...validRegions))
  .default(['us-east-1'])
  .description(
    'An array of one or more data center locations where to run the this check'
  )
  .label('CheckLocationList')

const checkRequestSchema = Joi.object()
  .when('checkType', {
    is: 'API',
    then: requestSchema.required(),
    otherwise: Joi.object().optional().allow(null).strip(),
  })
  .label('CheckRequest')

const commonCheckSchema = {
  name: Joi.string().required().description('The name of the check'),

  checkType: Joi.string()
    .valid(...checkTypes)
    .required()
    .description('The type of the check'),

  frequency: Joi.number()
    .integer()
    .optional()
    .when('checkType', {
      is: 'BROWSER',
      then: Joi.number().valid(...browserSchedules),
      otherwise: Joi.number().valid(...apiSchedules),
    })
    .default(10)
    .description('how often the check should run in minutes'),

  frequencyOffset: Joi.number().integer().optional().min(1),

  activated: Joi.boolean()
    .required()
    .default(true)
    .description('Determines if the check is running or not'),

  muted: Joi.boolean()
    .optional()
    .default(false)
    .description(
      'Determines if any notifications will be send out when a check fails and/or recovers'
    ),

  doubleCheck: Joi.boolean()
    .optional()
    .default(true)
    .description(
      'Setting this to "true" will trigger a retry when a check fails from the failing region and another, randomly selected region before marking the check as failed'
    ),

  sslCheck: Joi.boolean()
    .optional()
    .description(
      'Determines if the SSL certificate should be validated for expiry'
    ),

  shouldFail: Joi.boolean()
    .optional()
    .description(
      'Allows to invert the behaviour of when a check is considered to fail. Allows for validating error status like 404'
    ),

  locations: locationListSchema,
  request: checkRequestSchema,

  script: Joi.string().when('checkType', {
    is: 'BROWSER',
    then: Joi.string()
      .required()
      .allow(null)
      .description(
        'A valid piece of Node.js javascript code describing a browser interaction with the Puppeteer or Playwright frameworks.'
      ),
    otherwise: Joi.string().allow(null).allow('').optional(),
  }),

  environmentVariables: Joi.array()
    .items(envVarSchema)
    .optional()
    .allow(null)
    .description(
      'Key/value pairs for setting environment variables during check execution. These are only relevant for Browser checks. Use global environment variables whenever possible.'
    )
    .label('CheckEnvironmentVariableList'),

  tags: checkTagListSchema,

  setupSnippetId: Joi.number()
    .allow(null)
    .default(null)
    .optional()
    .description(
      'An ID reference to a snippet to use in the setup phase of an API check'
    ),

  tearDownSnippetId: Joi.number()
    .allow(null)
    .default(null)
    .optional()
    .description(
      'An ID reference to a snippet to use in the teardown phase of an API check'
    ),

  localSetupScript: Joi.string()
    .allow(null)
    .allow('')
    .optional()
    .default(null)
    .description('A valid piece of Node.js code to run in the setup phase'),

  localTearDownScript: Joi.string()
    .allow(null)
    .allow('')
    .optional()
    .default(null)
    .description('A valid piece of Node.js code to run in the teardown phase'),

  alertSettings: alertSettingsSchema.allow(null).label('CheckAlertSettings'),

  useGlobalAlertSettings: Joi.boolean()
    .optional()
    .default(true)
    .description(
      'When true, the account level alert setting will be used, not the alert setting defined on this check'
    ),

  degradedResponseTime: Joi.number()
    .min(0)
    .max(300000)
    .allow(null)
    .optional()
    .default(10000)
    .description(
      'The response time in milliseconds where a check should be considered degraded'
    ),

  maxResponseTime: Joi.number()
    .min(0)
    .max(300000)
    .allow(null)
    .optional()
    .default(20000)
    .description(
      'The response time in milliseconds where a check should be considered failing'
    ),

  groupId: Joi.number()
    .allow(null)
    .optional()
    .default(null)
    .description('The id of the check group this check is part of'),

  groupOrder: Joi.number()
    .min(0)
    .allow(null)
    .optional()
    .default(null)
    .description(
      'The position of this check in a check group. It determines in what order checks are run when a group is triggered from the API or from CI/CD'
    ),

  runtimeId: Joi.string()
    .valid(...availableRuntimes)
    .allow(null)
    .default(null)
    .optional()
    .description(
      'The runtime version, i.e. fixed set of runtime dependencies, used to execute this check'
    ),

  alertChannelSubscriptions: alertChannelSubscriptionListCreateSchema,
}

const checkCreateSchema = Joi.object()
  .keys({
    ...commonCheckSchema,
    frequencyOffset: Joi.number()
      .integer()
      .optional()
      .min(1)
      .custom(customFrequencyOffsetValidator)
      .description(
        'Used for setting seconds for check frequencies under 1 minutes (only for API checks) and spreading checks over a time range for frequencies over 1 minute. This works as follows: ' +
          'Checks with a frequency of 0 can have a frequencyOffset of 10, 20 or 30 meaning they will run every 10, 20 or 30 seconds. ' +
          'Checks with a frequency lower than and equal to 60 can have a frequencyOffset between 1 and a max value based on the formula "Math.floor(frequency * 10)", i.e. for a check that runs every 5 minutes the max frequencyOffset is 50. ' +
          'Checks with a frequency higher than 60 can have a frequencyOffset between 1 and a max value based on the formula "Math.ceil(frequency / 60)", i.e. for a check that runs every 720 minutes, the max frequencyOffset is 12. '
      ),
  })
  .options({ stripUnknown: { objects: true, arrays: true } })
  .label('CheckCreate')

module.exports = {
  checkCreateSchema,
  alertChannelsSchema,
  alertChannelSubscriptionList,
  commonCheckSchema,
}
