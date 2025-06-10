import { Bundle } from './construct'
import { Dashboard } from './dashboard'

export interface DashboardBundleProps {
  customCSS?: string
}

export class DashboardBundle implements Bundle {
  dashboard: Dashboard
  customCSS?: string

  constructor (dashboard: Dashboard, props: DashboardBundleProps) {
    this.dashboard = dashboard
    this.customCSS = props.customCSS
  }

  synthesize () {
    return {
      ...this.dashboard.synthesize(),
      customCSS: this.customCSS,
    }
  }
}
