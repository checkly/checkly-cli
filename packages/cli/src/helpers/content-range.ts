export function parseTotalFromContentRange (header: string | undefined): number | null {
  if (!header) return null
  const match = header.match(/\/(\d+)$/)
  return match ? parseInt(match[1], 10) : null
}
