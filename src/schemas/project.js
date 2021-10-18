const Joi = require('joi')

const projectSchema = Joi.object({
  projectId: Joi.number().required(),
  projectName: Joi.string().required(),
  locations: Joi.array(),
  interval: Joi.string(),
  alerts: Joi.array(),
})

module.exports = { projectSchema }
