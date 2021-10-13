const Joi = require('joi')

const escalationTypes = {
  RUN_BASED: 'RUN_BASED',
  TIME_BASED: 'TIME_BASED',
}

const alertSettingsSchema = Joi.object()
  .keys({
    escalationType: Joi.string()
      .valid(...Object.values(escalationTypes))
      .default(escalationTypes.RUN_BASED)
      .description('Determines what type of escalation to use'),

    runBasedEscalation: Joi.object().keys({
      failedRunThreshold: Joi.number()
        .valid(1, 2, 3, 4, 5)
        .default(1)
        .description(
          'After how many failed consecutive check runs an alert notification should be send'
        ),
    }),
    timeBasedEscalation: Joi.object().keys({
      minutesFailingThreshold: Joi.number()
        .valid(5, 10, 15, 30)
        .default(5)
        .description(
          'After how many minutes after a check starts failing an alert should be send'
        ),
    }),
    reminders: Joi.object().keys({
      amount: Joi.number()
        .valid(0, 1, 2, 3, 4, 5, 100000)
        .default(0)
        .description(
          'How many reminders to send out after the initial alert notification'
        ),

      interval: Joi.number()
        .valid(5, 10, 15, 30)
        .default(5)
        .description('At what interval the reminders should be send'),
    }),
    sslCertificates: Joi.object().keys({
      enabled: Joi.boolean()
        .default(true)
        .description(
          'Determines if alert notifications should be send for expiring SSL certificates'
        ),

      alertThreshold: Joi.number()
        .integer()
        .min(1)
        .max(30)
        .default(30)
        .description(
          'At what moment in time to start alerting on SSL certificates'
        ),
    }),
  })
  .default({
    escalationType: escalationTypes.RUN_BASED,
    runBasedEscalation: { failedRunThreshold: 1 },
    timeBasedEscalation: { minutesFailingThreshold: 5 },
    reminders: { amount: 0, interval: 5 },
    sslCertificates: { enabled: false, alertThreshold: 30 },
  })
  .options({ stripUnknown: { objects: true, arrays: true } })
  .description('Alert settings')

const alertChannelSubscriptionCreateSchema = Joi.object()
  .keys({
    alertChannelId: Joi.number().required(),
    activated: Joi.boolean().required().default(true),
  })
  .options({ stripUnknown: { objects: true, arrays: true } })
  .description('Alert channel subscription')

const alertChannelSubscriptionListCreateSchema = Joi.array()
  .items(alertChannelSubscriptionCreateSchema)
  .description('List of alert channel subscriptions')

module.exports = {
  alertSettingsSchema,
  alertChannelSubscriptionCreateSchema,
  alertChannelSubscriptionListCreateSchema,
}
