// Read when a loader is chosen rather than when this module loads, so that
// importing a loader reads no environment.
export function preferredLoader (): string | undefined {
  return process.env.CHECKLY_PREFERRED_LOADER
}

export function isPreferredLoader (name: string): boolean {
  return preferredLoader() === name
}

export function preferenceDelta (name: string): number {
  return isPreferredLoader(name) ? 200 : 0
}
