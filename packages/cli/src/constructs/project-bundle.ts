import { Bundle, Construct } from './construct'
import { Project, Resources } from './project'

export type ResourceDataBundle<T> = {
  construct: T
  bundle: Bundle
}

export type ProjectDataBundle = {
  [x in keyof Resources]: Record<string, ResourceDataBundle<Resources[x]>>
}

export class ProjectBundle implements Bundle {
  project: Project
  data: ProjectDataBundle

  constructor (project: Project, data: ProjectDataBundle) {
    this.project = project
    this.data = data
  }

  private synthesizeRecord (record: Record<string, ResourceDataBundle<Construct>>) {
    return Object.entries(record)
      .map(([key, { construct, bundle }]) => ({
        logicalId: key,
        type: construct.type,
        physicalId: construct.physicalId,
        member: construct.member,
        payload: bundle.synthesize(),
      }))
  }

  synthesize () {
    return {
      ...this.project.synthesize(),
      resources: [
        // Create status pages before checks because checks may refer to
        // status page services via incident triggers.
        ...this.synthesizeRecord(this.data['status-page-service']),
        ...this.synthesizeRecord(this.data['status-page']),
        ...this.synthesizeRecord(this.data.check),
        ...this.synthesizeRecord(this.data['check-group']),
        ...this.synthesizeRecord(this.data['alert-channel']),
        ...this.synthesizeRecord(this.data['alert-channel-subscription']),
        ...this.synthesizeRecord(this.data['maintenance-window']),
        ...this.synthesizeRecord(this.data['private-location']),
        ...this.synthesizeRecord(this.data['private-location-check-assignment']),
        ...this.synthesizeRecord(this.data['private-location-group-assignment']),
        ...this.synthesizeRecord(this.data.dashboard),
      ],
    }
  }
}
