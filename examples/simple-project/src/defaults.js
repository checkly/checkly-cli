const defaults = {
  pageUrl: process.env.ENVIRONMENT_URL || 'https://checklyhq.com',
  playwright: {
    viewportSize: { width: 1920, height: 1080 },
  },
}

module.exports = {
  defaults,
}
