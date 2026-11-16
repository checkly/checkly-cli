/** The `locations` a generated construct sets, in order, or `undefined` when it sets none. */
export function generatedLocations (source: string): string[] | undefined {
  const match = /(?<![A-Za-z])locations: \[([^\]]*)\]/.exec(source)
  if (match === null) {
    return
  }
  return [...match[1].matchAll(/'([^']*)'/g)].map(([, location]) => location)
}
