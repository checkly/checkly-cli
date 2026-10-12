// Run in a detached background process by the update-check init hook:
//
//   node refresh-latest-version.js <name> <versionFile> <currentVersion> [registry]
//
// Fetches the package's dist-tags from the npm registry and caches them in
// <versionFile>, where the hook looks for newer versions.
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import axios from 'axios'
import getAuthToken from 'registry-auth-token'
import getRegistryUrl from 'registry-auth-token/registry-url.js'

import { assignProxy } from './proxy.js'

async function refresh (name: string, versionFile: string, currentVersion: string, configuredRegistry: string) {
  // The configured registry, else 1) the registry set for the scope, 2) the
  // default registry in .npmrc, or 3) the public npm registry.
  const registry = configuredRegistry || getRegistryUrl(name.split('/', 1)[0])
  const authToken = getAuthToken(registry)

  // Touch the file first so that concurrent commands don't all refresh.
  await mkdir(dirname(versionFile), { recursive: true })
  await writeFile(versionFile, JSON.stringify({ current: currentVersion }))

  const url = `${registry.replace(/\/+$/, '')}/${name.replace('/', '%2f')}`
  const { data } = await axios.get(url, assignProxy(url, {
    headers: authToken ? { authorization: `${authToken.type} ${authToken.token}` } : {},
    timeout: 5000,
  }))
  await writeFile(versionFile, JSON.stringify({ ...data['dist-tags'], current: currentVersion }))
}

const [name, versionFile, currentVersion, registry = ''] = process.argv.slice(2)
if (name && versionFile && currentVersion) {
  // Nobody sees this process's output, so failures are silently ignored; the
  // next refresh retries.
  await refresh(name, versionFile, currentVersion, registry).catch(() => {})
}

// Don't wait for idle keep-alive sockets to close.
process.exit(0)
