export const defaults = {
  pageUrl: process.env.ENVIRONMENT_URL || 'https://checklyhq.com', // the pageUrl can be replaced by urls from a preview / staging environment.
  playwright: {
    viewportSize: { width: 1920, height: 1080 },
  },
}
