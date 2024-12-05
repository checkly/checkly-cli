import type { Region } from '..'
import { PlaywrightConfig } from './playwright-config'
import { Construct } from './construct'

export interface StepProps {
    name: string,
    checkMatch: string | string[],
    playwrightConfig?: PlaywrightConfig,
    workers?: number,
    dependencies?: string[],
    teardown?: string,
}

export class Step extends Construct implements StepProps {
  name: string
  checkMatch: string | string[]
  dependencies?: string[]
  playwrightConfig?: PlaywrightConfig
  teardown?: string
  workers?: number
  suiteLogicalId?: string

  static readonly __checklyType = 'check-step'
  constructor (props: StepProps, suiteLogicalId: string) {
    super(Step.__checklyType, props.name)
    this.checkMatch = props.checkMatch
    this.dependencies = props.dependencies
    this.playwrightConfig = props.playwrightConfig
    this.teardown = props.teardown
    this.workers = props.workers
    this.name = props.name
    this.suiteLogicalId = suiteLogicalId
  }

  synthesize (): any {
    return {
      name: this.name,
      dependencies: this.dependencies,
      playwrightConfig: this.playwrightConfig,
      teardown: this.teardown,
      workers: this.workers,
      logicalId: this.logicalId,
      suiteLogicalId: this.suiteLogicalId,
      type: this.type,
    }
  }
}
export interface OrchestratedSuite {
    name: string,
    frequency: number,
    locations?: Array<keyof Region>,
    playwrightConfig?: PlaywrightConfig,
    steps: Array<StepProps>
}

export class Suite extends Construct implements OrchestratedSuite {
  frequency: number
  name: string
  steps: Array<Step>
  locations?: Array<keyof Region>
  playwrightConfig?: PlaywrightConfig

  static readonly __checklyType = 'check-suite'
  constructor (logicalId: string, props: OrchestratedSuite) {
    super(Suite.__checklyType, logicalId)
    this.logicalId = logicalId
    this.frequency = props.frequency
    this.steps = props.steps.map(step => new Step(step, logicalId))
    this.name = props.name
    this.locations = props.locations
    this.playwrightConfig = props.playwrightConfig
  }

  synthesize (): any {
    return {
      name: this.name,
      frequency: this.frequency,
      locations: this.locations,
      playwrightConfig: this.playwrightConfig,
      steps: this.steps.map(step => step.synthesize()),
      logicalId: this.logicalId,
      type: this.type,
    }
  }
}

export type Suites = Array<OrchestratedSuite>
