const config = {}

config.accountName = process.env.CHECKLY_ACCOUNT_NAME || 'Checkly CLI E2E'
config.apiKey = process.env.CHECKLY_API_KEY
config.accountId = process.env.CHECKLY_ACCOUNT_ID
config.baseURL = process.env.CHECKLY_BASE_URL || 'https://api.checklyhq.com'

config.emptyApiKey = process.env.CHECKLY_EMPTY_API_KEY
config.emptyAccountId = process.env.CHECKLY_EMPTY_ACCOUNT_ID

export default config
