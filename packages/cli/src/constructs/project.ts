import os from 'node:os'

import PQueue from 'p-queue'

import { Construct } from './construct.js'
import {
  Check, AlertChannelSubscription, AlertChannel, CheckGroup, MaintenanceWindow, Dashboard,
  PrivateLocation, HeartbeatMonitor, PrivateLocationCheckAssignment, PrivateLocationGroupAssignment,
  StatusPage, StatusPageService,
} from './/index.js'
import { Diagnostics } from './diagnostics.js'
import { ConstructDiagnostics, InvalidPropertyValueDiagnostic } from './construct-diagnostics.js'
import { ProjectBundle, ProjectDataBundle } from './project-bundle.js'
import { Bundler } from '../services/check-parser/bundler.js'
import { Session } from './session.js'

// Cap how many constructs bundle concurrently. Bundling parses and resolves
// each check's dependency tree, so an unbounded fan-out over hundreds of checks
// can spike heap usage badly. Scale with CPU count but keep an upper bound so
// peak memory stays predictable on high-core machines.
const BUNDLE_CONCURRENCY = Math.max(4, Math.min(os.cpus().length, 16))

export interface ProjectProps {
  /**
   * Friendly name for your project.
   */
  name: string
  /**
   * Git repository URL.
   */
  repoUrl?: string
}

export type Resources = {
  'check': Check
  'check-group': CheckGroup
  'alert-channel': AlertChannel
  'alert-channel-subscription': AlertChannelSubscription
  'maintenance-window': MaintenanceWindow
  'private-location': PrivateLocation
  'private-location-check-assignment': PrivateLocationCheckAssignment
  'private-location-group-assignment': PrivateLocationGroupAssignment
  'dashboard': Dashboard
  'status-page': StatusPage
  'status-page-service': StatusPageService
}

export type ProjectData = {
  [x in keyof Resources]: Record<string, Resources[x]>
}

export class Project extends Construct {
  name: string
  repoUrl?: string
  logicalId: string
  testOnlyAllowed = false
  data: ProjectData = {
    'check': {},
    'check-group': {},
    'alert-channel': {},
    'alert-channel-subscription': {},
    'maintenance-window': {},
    'private-location': {},
    'private-location-check-assignment': {},
    'private-location-group-assignment': {},
    'dashboard': {},
    'status-page': {},
    'status-page-service': {},
  }

  static readonly __checklyType = 'project'

  /**
   * Constructs the Project instance
   *
   * @param logicalId unique project identifier
   * @param props project configuration properties
   */
  constructor (logicalId: string, props: ProjectProps) {
    super(Project.__checklyType, logicalId)
    this.name = props.name
    this.repoUrl = props.repoUrl
    this.logicalId = logicalId
  }

  describe (): string {
    return `Project:${this.logicalId}`
  }

  async validate (diagnostics: Diagnostics): Promise<void> {
    await super.validate(diagnostics)

    if (!this.name) {
      diagnostics.add(new InvalidPropertyValueDiagnostic(
        'name',
        new Error(`Value must not be empty.`),
      ))
    }

    const data: Record<keyof ProjectData, Record<string, Construct>> = this.data

    const constructDiagnostics = await Promise.all(
      Object.entries(data).flatMap(([, records]) => {
        return Object.values(records).map(async construct => {
          const diagnostics = new ConstructDiagnostics(construct)
          await construct.validate(diagnostics)
          return diagnostics
        })
      }),
    )

    diagnostics.extend(...constructDiagnostics)
  }

  allowTestOnly (enabled: boolean) {
    this.testOnlyAllowed = enabled
  }

  addResource (type: string, logicalId: string, resource: Construct) {
    const existingResource = this.data[type as keyof ProjectData][logicalId]
    if (existingResource) {
      // Non-member resources (i.e. references) can be used multiple times.
      // Behind the scenes, we'll create a single mapping for them, and the
      // referenced resource isn't managed by the project at all.
      if (!resource.member && !existingResource.member && existingResource.physicalId === resource.physicalId) {
        return
      }

      throw new Error(`Resource of type '${type}' with logical id '${logicalId}' already exists.`)
    }

    this.data[type as keyof ProjectData][logicalId] = resource
  }

  async bundle (bundler: Bundler): Promise<ProjectBundle> {
    const data: Record<keyof ProjectData, Record<string, Construct>> = {
      ...this.data,

      // Filter out testOnly checks before bundling.
      check: Object.fromEntries(
        Object.entries(this.data.check)
          .filter(([, check]) => !check.testOnly || this.testOnlyAllowed)
          .filter(([, check]) => Session.checkFilter?.(check) ?? true),
      ),
    }

    const dataBundle = Object.fromEntries(
      Object.entries(data).map(([type]) => {
        return [type, {}]
      }),
    ) as ProjectDataBundle

    // Bundle constructs through a bounded queue rather than an unbounded
    // Promise.all. Each task writes a distinct [type][logicalId] slot, so the
    // concurrent writes don't race; the final assembly is order-independent.
    const queue = new PQueue({ concurrency: BUNDLE_CONCURRENCY })
    await queue.addAll(
      Object.values(data).flatMap(records => {
        return Object.values(records).map(construct => async () => {
          const bundle = await construct.bundle(bundler)
          const { type, logicalId } = construct
          dataBundle[type as keyof ProjectDataBundle][logicalId] = { construct, bundle }
        })
      }),
    )

    return new ProjectBundle(this, dataBundle)
  }

  synthesize () {
    const project = {
      logicalId: this.logicalId,
      name: this.name,
      repoUrl: this.repoUrl,
    }
    return {
      project,
      sharedFiles: Session.sharedFiles,
    }
  }

  getTestOnlyConstructs (): Construct[] {
    return Object
      .values(this.data)
      .flatMap((record: Record<string, Construct>) =>
        Object
          .values(record)
          .filter((construct: Construct) => construct instanceof Check && construct.testOnly))
  }

  getHeartbeatLogicalIds (): string[] {
    return Object
      .values(this.data.check)
      .filter((construct: Construct) => construct instanceof HeartbeatMonitor)
      .map((construct: Check) => construct.logicalId)
  }
}
