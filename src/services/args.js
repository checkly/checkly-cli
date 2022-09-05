const { ACTIONS } = require('./constants')

const action = {
  name: 'action',
  required: true,
  description: 'Specify the type of action to run',
  options: [ACTIONS.LIST, ACTIONS.INFO],
  default: ACTIONS.LIST,
}

const id = {
  name: 'id',
  required: false,
  description: 'Specify the resource ID',
}

const basepath = {
  name: 'path',
  required: true,
  description: 'Specify a target path to create the Pulumi files',
}

module.exports = {
  id,
  action,
  basepath,
}
