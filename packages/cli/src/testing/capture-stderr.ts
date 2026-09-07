/**
 * Runs `fn` with `process.stderr.write` swapped for a collector and returns
 * every chunk written meanwhile. Used to observe output that only goes to
 * stderr, such as the `debug` channel, without a TTY.
 */
export async function captureStderr (fn: () => Promise<void>): Promise<string[]> {
  const written: string[] = []
  const original = process.stderr.write.bind(process.stderr)
  process.stderr.write = ((chunk: string) => {
    written.push(String(chunk))
    return true
  }) as never
  try {
    await fn()
  } finally {
    process.stderr.write = original
  }
  return written
}
