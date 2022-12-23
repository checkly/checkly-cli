// 'config' also supports TypeScript, but there are bugs. Hence, we just use JS.
// https://github.com/node-config/node-config/issues/530
const config = {}

config.accountName = process.env.CHECKLY_ACCOUNT_NAME || 'Checkly CLI E2E'
config.apiKey = process.env.CHECKLY_API_KEY
config.accountId = process.env.CHECKLY_ACCOUNT_ID

module.exports = config