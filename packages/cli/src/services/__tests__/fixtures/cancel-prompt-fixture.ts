import prompts from 'prompts'

async function main (): Promise<void> {
  if (process.env.FORCE_RAW === '1' && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true)
  }

  await new Promise<void>(resolve => {
    const swallow = (): void => { /* discard pre-buffered bytes */ }
    process.stdin.on('data', swallow)
    setImmediate(() => setImmediate(() => {
      process.stdin.removeListener('data', swallow)
      resolve()
    }))
  })

  // Signal to the test harness that the prompt is about to open.
  process.stdout.write('PROMPT_OPEN\n')

  const killHandler = (): void => process.exit(2)
  process.once('SIGINT', killHandler)

  try {
    const { confirmed } = await prompts({
      type: 'confirm',
      name: 'confirmed',
      message: 'Stop running checks?',
      initial: true,
    })

    if (confirmed === undefined) {
      process.exit(1)
    }
    process.exit(confirmed ? 0 : 1)
  } finally {
    process.off('SIGINT', killHandler)
  }
}

main()
