import { BrowserCheck, BrowserCheckProps } from './browser-check'
import { Session } from './project'

/**
 * Creates a Multistep Check
 *
 * @remarks
 *
 * This class make use of the Browser Checks endpoints.
 */
export class MultiStepCheck extends BrowserCheck {
  constructor (logicalId: string, props: BrowserCheckProps) {
    super(logicalId, props)

    if (!Session.availableRuntimes[this.runtimeId!]?.multiStepSupport) {
      throw new Error('This runtime does not support multi step checks.')
    }
  }

  synthesize () {
    return {
      ...super.synthesize(),
      checkType: 'MULTI_STEP',
    }
  }
}
