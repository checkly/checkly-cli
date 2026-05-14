import path from 'node:path'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import { describe, it, expect } from 'vitest'

const fixturePath = path.resolve(
  __dirname,
  '../../src/services/__tests__/fixtures/cancel-prompt-fixture.ts',
)

function waitForStdoutLine (
  proc: ChildProcessWithoutNullStreams,
  needle: string,
  timeout: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = ''
    const timer = setTimeout(() => {
      reject(new Error(`Timed out after ${timeout}ms waiting for stdout line containing "${needle}"`))
    }, timeout)

    const onData = (chunk: Buffer): void => {
      buffer += chunk.toString()
      if (buffer.includes(needle)) {
        clearTimeout(timer)
        proc.stdout.off('data', onData)
        resolve()
      }
    }

    proc.stdout.on('data', onData)
  })
}

function waitForExit (proc: ChildProcessWithoutNullStreams, timeout: number): Promise<number> {
  return new Promise((resolve, reject) => {
    if (proc.exitCode !== null) {
      resolve(proc.exitCode)
      return
    }

    const timer = setTimeout(() => {
      proc.kill()
      reject(new Error(`Process did not exit within ${timeout}ms`))
    }, timeout)

    proc.once('exit', code => {
      clearTimeout(timer)
      resolve(code ?? 1)
    })
  })
}

describe('cancel-prompt fixture', () => {
  it('buffered ^C byte before prompt does not auto-abort', async () => {
    // Arrange
    const proc = spawn(process.execPath, ['-r', 'ts-node/register', fixturePath], {
      env: { ...process.env, FORCE_RAW: '1', TS_NODE_TRANSPILE_ONLY: 'true' },
      stdio: 'pipe',
    })

    // Act — write ^C immediately so it is buffered before the prompt opens
    proc.stdin.write('\x03')
    await waitForStdoutLine(proc, 'PROMPT_OPEN', 5000)

    // Assert — process must still be alive 200ms after prompt opened
    await new Promise<void>(resolve => setTimeout(resolve, 200))
    expect(proc.exitCode).toBeNull()

    // Clean up — answer 'n' so the process exits cleanly
    proc.stdin.write('n\n')
    const exitCode = await waitForExit(proc, 5000)
    expect(exitCode).toBe(1)
  }, 10000)

  it('typed y after prompt opens confirms and exits 0', async () => {
    // Arrange
    const proc = spawn(process.execPath, ['-r', 'ts-node/register', fixturePath], {
      env: { ...process.env, FORCE_RAW: '1', TS_NODE_TRANSPILE_ONLY: 'true' },
      stdio: 'pipe',
    })

    // Act
    await waitForStdoutLine(proc, 'PROMPT_OPEN', 5000)
    proc.stdin.write('y\n')

    // Assert
    const exitCode = await waitForExit(proc, 5000)
    expect(exitCode).toBe(0)
  }, 10000)
})
