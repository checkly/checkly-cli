/**
 * Attempts to look up the value for the given secret and throws an error if
 * no value can be found.
 *
 * This basic utility is provided for convenience, but it is by no means best
 * practice and you are certainly not required to use it. We recommend
 * integrating your own secrets management instead.
 */
export function secret (name: string): string {
  const tryEnvs = new Set([
    `CHECKLY_SECRET_${name}`,
    `CHECKLY_SECRET_${name.toUpperCase()}`,
  ])

  for (const env of tryEnvs) {
    const envValue = process.env[env]
    if (envValue !== undefined) {
      return envValue
    }
  }

  const triedString = Array.from(tryEnvs.values()).join(', ')

  throw new Error(`Missing value for secret '${name}' (tried the following environment variables: ${triedString})`)
}
