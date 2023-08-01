function pmFromUserAgent (userAgent: string) {
  const pmSpec = userAgent.split(' ')[0]
  const separatorPos = pmSpec.lastIndexOf('/')
  const name = pmSpec.substring(0, separatorPos)
  return {
    name: name === 'npminstall' ? 'cnpm' : name,
    version: pmSpec.substring(separatorPos + 1),
  }
}

export function getPackageManager () {
  if (!process.env.npm_config_user_agent) {
    return undefined
  }
  return pmFromUserAgent(process.env.npm_config_user_agent)
}
