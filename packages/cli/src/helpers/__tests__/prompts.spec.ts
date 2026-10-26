import { describe, expect, it, vi } from 'vitest'
import prompts from 'prompts'

import { prompt } from '../prompts.js'

vi.mock('prompts', () => ({ default: vi.fn().mockResolvedValue({}) }))

describe('prompt', () => {
  it('renders a question on stderr and forwards the options', async () => {
    const onCancel = () => false

    await prompt({ name: 'confirm', type: 'confirm', message: 'Proceed?' }, { onCancel })

    expect(prompts).toHaveBeenCalledWith(
      { name: 'confirm', type: 'confirm', message: 'Proceed?', stdout: process.stderr },
      { onCancel },
    )
  })
})
