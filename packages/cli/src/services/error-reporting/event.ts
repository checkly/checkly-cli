import { MAX_CAUSE_DEPTH, PACKAGE_ROOT, realpath } from './classify.js'
import { cliDependencies, scrubFrame, scrubMessage } from './scrub.js'
import { eventId, parseStack, type ErrorEvent, type Exception } from './sentry-protocol.js'

export interface ErrorReportContext {
  /** The CLI version, `this.config.version`. */
  version: string
  /** The oclif command id, e.g. `deploy` or `checks:list`. */
  command?: string
  /** The detected CLI mode: interactive, ci or agent. */
  cliMode?: string
  /** Whether a command caught and printed the error, rather than it ending the command. */
  handled?: boolean
}

/** The environment a release reports as, from its version. */
export function releaseEnvironment (version: string): string {
  if (/^\d+\.\d+\.\d+$/.test(version)) return 'production'
  if (/-rc\.\d+$/.test(version)) return 'rc'
  // Prereleases (`-prerelease-<sha>`) and anything else. Canary and local
  // builds never report (isDevelopmentBuild).
  return 'prerelease'
}

/**
 * The exceptions of `err` and its causes, innermost cause first, as Sentry
 * expects them. Only the name, the scrubbed message and the scrubbed frames
 * are kept: an error's other properties (an axios error's request config with
 * its auth headers, for one) are never sent.
 */
function toExceptions (
  err: Error,
  packageRoot: string,
  env: NodeJS.ProcessEnv,
  secrets: string[],
  handled: boolean,
): Exception[] {
  const dependencies = cliDependencies(packageRoot)

  const exceptions: Exception[] = []
  let current: unknown = err
  while (current instanceof Error && exceptions.length < MAX_CAUSE_DEPTH) {
    const frames = parseStack(current.stack ?? '')
    exceptions.unshift({
      type: current.name,
      value: scrubMessage(current.message, env, { packageRoot, secrets }),
      stacktrace: frames.length
        ? { frames: frames.map(frame => scrubFrame(frame, packageRoot, dependencies)) }
        : undefined,
      mechanism: { type: 'generic', handled },
    })
    current = current.cause
  }
  return exceptions
}

/** The Sentry event for `err`. Exported for tests. */
export function buildErrorEvent (
  err: Error,
  context: ErrorReportContext,
  {
    packageRoot = PACKAGE_ROOT,
    env = process.env,
    secrets = [],
  }: { packageRoot?: string, env?: NodeJS.ProcessEnv, secrets?: string[] } = {},
): ErrorEvent {
  const runtime = process.versions.bun ? 'bun' : process.versions.deno ? 'deno' : 'node'
  return {
    event_id: eventId(),
    timestamp: Date.now() / 1000,
    platform: 'node',
    level: context.handled ? 'error' : 'fatal',
    release: `checkly@${context.version}`,
    environment: releaseEnvironment(context.version),
    exception: { values: toExceptions(err, realpath(packageRoot), env, secrets, !!context.handled) },
    tags: {
      ...(context.command && { command: context.command }),
      ...(context.cliMode && { cli_mode: context.cliMode }),
    },
    contexts: {
      os: { name: process.platform },
      runtime: { name: runtime, version: process.versions[runtime] ?? process.version },
      device: { arch: process.arch },
    },
    // Only what is set above is sent: no computer name, user, locale, working
    // directory, command arguments or environment variables.
  }
}
