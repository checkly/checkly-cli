const Joi = require('joi')

const account = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().alphanum().required(),
})

const project = Joi.object({
  id: Joi.number().required(),
  name: Joi.string().required(),
})

const settings = Joi.object({
  locations: Joi.array(),
  interval: Joi.string(),
  alerts: Joi.array(),
})

const projectSchema = Joi.object({
  account,
  project,
  settings,
})

module.exports = { projectSchema }
