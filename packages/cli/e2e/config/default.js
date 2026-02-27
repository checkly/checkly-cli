// 'config' also supports TypeScript, but there are bugs. Hence, we just use JS.
// https://github.com/node-config/node-config/issues/530
const config = {}

config.accountName = process.env.CHECKLY_ACCOUNT_NAME || 'Checkly CLI E2E'
config.apiKey = process.env.CHECKLY_API_KEY
config.accountId = process.env.CHECKLY_ACCOUNT_ID
config.baseURL = process.env.CHECKLY_BASE_URL || 'https://api.checklyhq.com'

// Optional: empty account for edge-case testing (no checks, no groups, etc.)
config.emptyApiKey = process.env.CHECKLY_EMPTY_API_KEY
config.emptyAccountId = process.env.CHECKLY_EMPTY_ACCOUNT_ID
config.emptyStatusPageId = process.env.CHECKLY_EMPTY_STATUS_PAGE_ID

module.exports = config
