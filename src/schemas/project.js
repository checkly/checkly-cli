const Joi = require('joi')

const { validRegions } = require('./common')

const projectLocationList = Joi.array()
  .items(Joi.string().valid(...validRegions))
  .min(1)
  .required()
  .default(['us-east-1'])
  .description(
    'An array of one or more data center locations where to run the checks'
  )

const projectSchema = Joi.object({
  projectId: Joi.number().required(),
  projectName: Joi.string().required(),
  defaultCheckSettings: Joi.object({
    locations: projectLocationList
  }).unknown(true)
})

module.exports = { projectSchema }
