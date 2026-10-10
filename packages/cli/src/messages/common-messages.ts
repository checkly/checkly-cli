const commonMessages = {
  forceMode: 'Force mode. Skips the confirmation dialog.',
  configFile: 'The Checkly CLI configuration file. If not passed, uses the checkly.config.ts|js file in the current'
    + ' directory.',
  envCredentialsConfigured: '`CHECKLY_API_KEY` (and `CHECKLY_ACCOUNT_ID`) environment variables'
    + ' are configured (via shell or .env file).',
  accountOverride: (accountId: string) => `\`CHECKLY_ACCOUNT_ID\` is set to "${accountId}" (on the command line,`
    + ' in your shell or in .env), so commands use that account instead of the default until it is unset.',
}

export default commonMessages
