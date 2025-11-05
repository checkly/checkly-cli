export const preferredLoader = process.env.CHECKLY_PREFERRED_LOADER

export function isPreferredLoader (name: string): boolean {
  return preferredLoader === name
}

export function preferenceDelta (name: string): number {
  return isPreferredLoader(name) ? 200 : 0
}
