const promptLocations = ({ name = 'locations', choices = [] } = {}) => ({
  name,
  type: 'checkbox',
  choices,
  validate: (locations) =>
    locations.length > 0 ? true : 'You have to pick at least one location',
  message: 'Select your target locations (we recommend to pick at least 2)'
})

const promptUrl = ({ name = 'url' } = {}) => ({
  name,
  type: 'input',
  validate: (url) =>
    url.match(/^(https?|chrome):\/\/[^\s$.?#].[^\s]*$/gm)
      ? true
      : 'Please enter a valid URL',
  message: 'Which URL you want to monitor'
})

const promptConfirm = ({ name = 'confirm', message = 'Do you want to continue?' } = {}) => ({
  name: name,
  type: 'confirm',
  message
})

module.exports = {
  promptUrl,
  promptConfirm,
  promptLocations
}
