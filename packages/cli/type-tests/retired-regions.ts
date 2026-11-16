import { defineConfig } from '../src/config.js'
import type { CheckGroupV2Props, CheckProps } from '../src/constructs/index.js'

/**
 * A retired location is not part of `Region`, so it fails to compile on every
 * surface that takes a location. Every other location still compiles.
 */

export const checkLocations: CheckProps['locations'] = [
  'eu-central-1',
  // @ts-expect-error me-south-1 (Bahrain) is retired.
  'me-south-1',
]

export const groupLocations: CheckGroupV2Props['locations'] = [
  'eu-central-1',
  // @ts-expect-error me-south-1 (Bahrain) is retired.
  'me-south-1',
]

export const configCheckLocations = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
  checks: {
    locations: [
      'eu-central-1',
      // @ts-expect-error me-south-1 (Bahrain) is retired.
      'me-south-1',
    ],
  },
})

export const configRunLocation = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
  cli: {
    // @ts-expect-error me-south-1 (Bahrain) is retired.
    runLocation: 'me-south-1',
  },
})

export const validConfig = defineConfig({
  projectName: 'type-test-project',
  logicalId: 'type-test-project',
  checks: {
    locations: ['eu-central-1', 'us-east-1'],
  },
  cli: {
    runLocation: 'eu-central-1',
  },
})
