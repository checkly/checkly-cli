import checkUpdate from '../../node_modules/@oclif/plugin-warn-if-update-available/lib/hooks/init/check-update.js'

// The warn-if-update-available init hook is registered directly (see
// oclif.hooks in package.json) rather than loaded as an oclif plugin, because
// plugin packages are not installed at runtime — @oclif/core and this hook
// are bundled in as devDependencies. The package's `exports` map blocks
// subpath imports, so this resolves the file directly through the
// workspace's node_modules at build time only; esbuild then inlines it.
export default checkUpdate
