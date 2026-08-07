import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import Debug from 'debug'
import { glob } from 'glob'
import { minimatch } from 'minimatch'

import { PhysicalFile } from './check-parser/parser.js'
import { pathToPosix } from './util.js'

const debug = Debug('checkly:cli:services:symlink-resolver')

const NODE_MODULES = 'node_modules'
const PNPM_STORE = '.pnpm'
const BIN_DIR = '.bin'

/**
 * pnpm records the state of a node_modules directory in these files. They must
 * never end up in a code bundle: on the runner the store directory differs from
 * the one they name, and pnpm reacts by purging node_modules entirely — without
 * prompting when CI is set.
 */
const PACKAGE_MANAGER_STATE_FILES = new Set([
  '.modules.yaml',
  '.pnpm-workspace-state.json',
  '.pnpm-workspace-state-v1.json',
])

export interface ResolveBundleFilesOptions {
  /** Absolute paths matched by the include globs. */
  matchedPaths: string[]
  /** Archive root. Every archive path is relative to this. */
  bundleRoot: string
  /** Directory the ignore patterns are relative to (the include glob's cwd). */
  ignoreCwd: string
  ignorePatterns: string[]
  /**
   * Paths that files in the bundle refer to by spelling — e.g. a Playwright
   * config's testDir or globalSetup, exactly as written. Content discovery
   * resolves such paths through any symlinks and bundles the real files, but
   * the reference itself still reads the original spelling at run time, so
   * every symlink it traverses must exist in the archive for it to resolve.
   * The links are carried as symlink entries only; what they point at is
   * bundled by whoever discovered the content.
   */
  referencedPaths?: string[]
  /**
   * The workspace's member packages, in any order. A package link whose target
   * is a member directory — and whose node_modules name matches the member's
   * package name, so the import parser can resolve it — gets selective
   * treatment: link + manifest + whatever was matched through it, instead of
   * whole-directory expansion, mirroring how non-linked workspace dependencies
   * are bundled. Empty or absent means no workspace: every in-root link target
   * keeps the expansion behaviour.
   */
  workspaceMembers?: Array<{ path: string, name: string }>
}

/**
 * Turns the paths matched by the include globs into archive entries, resolving
 * symlinks so that the resulting archive is both extractable and usable.
 *
 * Two problems make this necessary.
 *
 * Extractability: glob's `nodir` option filters on lstat, so a symlink pointing
 * at a directory is reported as if it were a regular file, while glob separately
 * walks *through* that same symlink and reports the files beneath it. Archiving
 * both yields a path that is simultaneously a symlink and a directory, which tar
 * refuses to extract. Package managers that link packages out of a shared store
 * (pnpm) make that the ordinary shape of node_modules.
 *
 * Usability: simply dereferencing the symlink does not work either. Under pnpm a
 * package's dependencies are siblings of it inside the store, not children, so a
 * flattened copy of node_modules/<pkg> cannot resolve anything it depends on.
 *
 * The archive therefore keeps symlinks as symlinks and brings their targets
 * along, which reproduces the layout the package manager built. The invariant
 * that makes it extractable: an entry is either a symlink, which by construction
 * never has children, or a regular file at a symlink-free archive path.
 */
export async function resolveBundleFiles (options: ResolveBundleFilesOptions): Promise<PhysicalFile[]> {
  const resolver = new SymlinkResolver(options)
  return await resolver.resolve(
    options.matchedPaths,
    options.referencedPaths ?? [],
    options.workspaceMembers ?? [],
  )
}

class SymlinkResolver {
  /**
   * Candidate archive roots. A path may be expressed either lexically (as the
   * include globs produced it) or canonically (as realpath produced it), and on
   * macOS those differ whenever the project sits under a symlinked prefix such
   * as /tmp. Both spellings must map to the same archive path.
   */
  #roots: string[] = []
  #ignoreCwd: string
  #ignorePatterns: string[]

  /** Archive entries, keyed by archive path. */
  #entries = new Map<string, PhysicalFile>()
  /** Paths already classified. */
  #classified = new Set<string>()
  /** Paths the include globs matched outright, as opposed to ones we followed to. */
  #directPaths = new Set<string>()
  /** Real directories already expanded. */
  #expanded = new Set<string>()
  /**
   * Store directories whose dependency links have been collected. Without this,
   * a dependency cycle — which pnpm stores have whenever two packages depend on
   * each other, as they routinely do — would recurse until the process dies, and
   * even an acyclic graph would be walked once per distinct path through it.
   */
  #closed = new Set<string>()
  /** Workspace member package names, keyed by canonical member directory. */
  #memberNames = new Map<string, string>()
  /** Out-of-root directories already copied, and where each one landed. */
  #copiedTrees = new Map<string, string>()
  #lstatCache = new Map<string, Stats | undefined>()
  #warned = new Set<string>()

  constructor (options: ResolveBundleFilesOptions) {
    this.#ignoreCwd = options.ignoreCwd
    this.#ignorePatterns = options.ignorePatterns
    this.#roots = [options.bundleRoot]
  }

  async resolve (
    matchedPaths: string[],
    referencedPaths: string[],
    workspaceMembers: Array<{ path: string, name: string }>,
  ): Promise<PhysicalFile[]> {
    const [bundleRoot] = this.#roots

    // The canonical root is what real paths are measured against; the lexical
    // root is what the include globs produced. Keep both, or a project reached
    // through a symlink would treat every real path as being outside the root.
    try {
      const realRoot = await fs.realpath(bundleRoot)
      if (realRoot !== bundleRoot) {
        this.#roots.push(realRoot)
      }
    } catch {
      // Root does not exist; nothing can be inside it anyway.
    }

    // Member paths are stored canonically: the workspace model records them as
    // given (sometimes lexical), while the link targets they are compared with
    // arrive here as realpaths.
    for (const member of workspaceMembers) {
      this.#memberNames.set(await this.#realpath(member.path) ?? member.path, member.name)
    }

    // Which paths the include globs matched is a property of the path, not of
    // when it happens to be reached: expansion can arrive at a directly-matched
    // file first, and it must not then be judged by rules the glob already
    // applied to it.
    for (const matchedPath of matchedPaths) {
      this.#directPaths.add(matchedPath)
    }

    for (const matchedPath of matchedPaths) {
      await this.#classify(matchedPath)
    }

    for (const referencedPath of referencedPaths) {
      await this.#carryReferencedLinks(referencedPath)
    }

    this.#pruneSymlinks()

    return Array.from(this.#entries.values())
  }

  /**
   * Emits a symlink entry for every link a referenced path traverses, so the
   * path resolves in the extracted archive exactly as spelled. Content is not
   * this method's concern — whoever referenced the path also discovers and
   * bundles what it points at (at real paths). Only the links travel here.
   *
   * The walk mirrors #classify's first-symlink rule: find the first symlinked
   * component, emit it, jump into the target's real namespace, and continue —
   * so every emitted link sits at a symlink-free archive path of its own and
   * the extractability invariant holds by construction.
   */
  async #carryReferencedLinks (referencedPath: string): Promise<void> {
    // Emissions are buffered until the whole walk succeeds. When a later hop
    // leaves the bundle root, discovery has fallen back to bundling the content
    // at the spelled path — real directories — and an already-emitted earlier
    // link would then sit above those very directories, guaranteeing its own
    // removal (and a spurious warning) at the bundler.
    const chain: Array<[string, string]> = []
    let current = referencedPath

    for (;;) {
      const symlink = await this.#firstSymlinkComponent(current)
      if (symlink === undefined) {
        break
      }

      const archivePath = this.#archivePathOf(symlink)
      if (archivePath === undefined || archivePath === '') {
        // The "link" is the bundle root itself — the whole project is reached
        // through a symlink, which the two-root reconciliation already absorbs.
        // The root is not an entry; emitting one at the empty name would abort
        // the archive.
        return
      }

      const target = await this.#realpath(symlink)
      if (target === undefined) {
        // Broken; the reference cannot resolve locally either.
        this.#skipDanglingSymlink(symlink)
        return
      }

      if (this.#archivePathOf(target) === undefined) {
        // The reference's content is outside the bundle root: discovery bundles
        // it at the spelled path (or errors), so the spelled tree extracts as
        // ordinary directories and no link entry is wanted anywhere along the
        // spelling.
        return
      }

      chain.push([symlink, target])

      if (current === symlink) {
        break
      }

      current = path.join(target, path.relative(symlink, current))
    }

    for (const [symlink, target] of chain) {
      this.#emitSymlink(symlink, target)
      // Marked separately: the same link may already be in the archive because
      // an include pattern matched it, and being referenced is a property of
      // the link, not of which pass got to it first.
      this.#markLinkReferenced(symlink)
    }
  }

  /**
   * Enforces, over the finished set of entries, the two things a symlink entry
   * must satisfy. Doing it here rather than at each emit is what makes it hold
   * regardless of the order paths happened to be classified in.
   *
   * A symlink must have nothing beneath it: one path cannot be both a symlink
   * and a directory, and tar refuses to extract an archive claiming otherwise —
   * the whole reason this resolver exists. Where entries did land beneath a link,
   * the link is what goes: the entries are real content and extract as ordinary
   * files, whereas the link would take the archive down with it.
   *
   * A symlink must also point at something the archive contains, or it extracts
   * into a link to nothing and the check fails at run time. Dropping one link can
   * empty out the directory another points at, so this repeats until it settles.
   */
  #pruneSymlinks (): void {
    for (;;) {
      // Every path the extracted archive will contain: each entry, and every
      // directory tar has to create on the way to it. Symlink entries count —
      // tar materializes their parent directories exactly as it does a file's —
      // so a link onto a directory holding nothing but other links still
      // resolves.
      const occupied = new Set<string>()
      for (const archivePath of this.#entries.keys()) {
        occupied.add(archivePath)

        for (
          let parent = path.posix.dirname(archivePath);
          parent !== '.' && parent !== '/' && parent !== '' && !occupied.has(parent);
          parent = path.posix.dirname(parent)
        ) {
          occupied.add(parent)
        }
      }

      let pruned = false

      for (const [archivePath, file] of Array.from(this.#entries)) {
        if (file.symlinkTarget === undefined) {
          continue
        }

        const hasChildren = Array.from(this.#entries.keys())
          .some(other => other.startsWith(`${archivePath}/`))

        const target = resolveArchivePath(archivePath, file.symlinkTarget)
        // A link onto the archive root always resolves; the root is not an
        // entry. A link carried for a referenced path resolves too: its target
        // content is bundled by the parser, which this resolver cannot see.
        const resolves = target === ''
          || occupied.has(target)
          || file.referencedLink === true

        if (hasChildren || !resolves) {
          debug(`Dropping symlink ${archivePath}: ${hasChildren ? 'has children' : 'target is not bundled'}`)
          this.#entries.delete(archivePath)
          pruned = true
        }
      }

      if (!pruned) {
        return
      }
    }
  }

  /**
   * Decides how a single matched path is represented in the archive. Everything
   * hinges on the *first* symlinked component of the path: it alone determines
   * the mode, which is what guarantees that entries never end up beneath a
   * symlink entry.
   *
   */
  async #classify (matchedPath: string): Promise<void> {
    if (this.#classified.has(matchedPath)) {
      return
    }
    this.#classified.add(matchedPath)

    if (isPackageManagerStateFile(matchedPath)) {
      // Reachable when an include pattern names the file outright, since a
      // literal dot segment matches even though wildcards do not.
      debug(`Refusing to bundle package manager state file ${matchedPath}`)
      return
    }

    // The include glob already applied the ignore patterns to what it matched,
    // in its own cwd namespace. Re-deciding those here would reinterpret the
    // user's patterns in a different namespace and could drop files the glob
    // deliberately kept. Content this resolver reached by itself, on the other
    // hand, the glob never saw — and it is the only content that needs checking.
    if (!this.#directPaths.has(matchedPath) && this.#isIgnored(matchedPath)) {
      return
    }

    const archivePath = this.#archivePathOf(matchedPath)
    if (archivePath === undefined) {
      // Include patterns may be absolute, and a Playwright config may live
      // outside the workspace root, so a matched path is not guaranteed to sit
      // under it. Such a path has no archive path relative to the root, and
      // therefore nothing a symlink could point at. Leave the archive path unset
      // and let the bundler name it exactly as it did before.
      this.#emit(matchedPath, {
        filePath: matchedPath,
        physical: true,
      })
      return
    }

    const symlink = await this.#firstSymlinkComponent(matchedPath)
    if (symlink === undefined) {
      this.#emitFile(matchedPath, archivePath)
      return
    }

    await this.#handleSymlink(symlink, matchedPath)
  }

  /**
   * Walks the path from the archive root downwards and returns the first
   * component that is a symlink. Components above the root are never examined —
   * a symlinked root is simply the root.
   */
  async #firstSymlinkComponent (target: string): Promise<string | undefined> {
    const root = this.#rootOf(target)
    if (root === undefined) {
      return undefined
    }

    const relative = path.relative(root, target)
    let current = root

    for (const segment of relative.split(path.sep)) {
      current = path.join(current, segment)
      const stats = await this.#lstat(current)
      if (stats?.isSymbolicLink()) {
        return current
      }
    }

    return undefined
  }

  async #handleSymlink (symlink: string, matchedPath: string): Promise<void> {
    const target = await this.#realpath(symlink)
    if (target === undefined) {
      this.#skipDanglingSymlink(symlink)
      return
    }

    const targetArchivePath = this.#archivePathOf(target)
    if (targetArchivePath === undefined) {
      const symlinkArchivePath = this.#archivePathOf(symlink)
      if (symlinkArchivePath !== undefined && this.#isIgnoredArchivePathOrContents(symlinkArchivePath)) {
        // The escape hatch: the user excluded the link itself.
        this.#warnOnce(
          symlink,
          `${symlink} is excluded from the bundle by the ignore patterns. Skipping the symlink.`,
        )
        return
      }

      // For node_modules shapes the user matched outright — a package link, or
      // a node_modules directory itself linked elsewhere (a cache volume, a
      // relocated virtual store) — the old behaviour of silently flattening the
      // target's contents produced bundles that only half-worked: a pnpm
      // package's dependencies are its store siblings, which never came along.
      // Fail loudly instead. The error is reserved for what the include
      // patterns named directly: a link this resolver reached on its own (a
      // store sibling pointing out of the project, say) must not turn a
      // previously-bundling project into a hard failure.
      const isNodeModulesShape = isInsideNodeModules(symlink) || path.basename(symlink) === NODE_MODULES
      if (isNodeModulesShape && this.#directPaths.has(matchedPath)) {
        throw new Error(
          `${symlink} points at ${target}, which is outside the project's bundle root `
          + `(${this.#roots[0]}). Files outside it cannot be included in the code bundle. The `
          + `bundle root is your workspace root, or the nearest package.json directory when the `
          + `project is not part of a workspace — if the target belongs to your monorepo, make `
          + `sure the package containing your Checkly config is listed in the workspace `
          + `configuration. Otherwise, move the target inside the project, exclude the symlink `
          + `via ignoreDirectoriesMatch, or narrow your include patterns.`,
        )
      }

      // A plain file or asset-directory link has no such failure mode: copying
      // the bytes to the spelled path produces a complete, working bundle, as
      // it always has. For node_modules shapes reached indirectly the copy is
      // the best available fallback — say what it cannot deliver.
      this.#warnOnce(
        symlink,
        isNodeModulesShape
          ? `${symlink} is linked from outside the project. Its contents will be bundled, but its `
          + `dependencies cannot be, so it may fail to resolve them when the check runs.`
          : `${symlink} points outside the project. Bundling its contents instead of the symlink.`,
      )
      await this.#copyOutOfRootLink(matchedPath)
      return
    }

    if (this.#isIgnored(target)) {
      // The ignore patterns exclude what this link points at, so its target will
      // not be in the archive. Keeping the link would extract to a link pointing
      // at nothing, which fails at run time rather than here.
      this.#warnOnce(
        symlink,
        `${symlink} points at ${target}, which is excluded from the bundle. Skipping the symlink.`,
      )
      return
    }

    this.#emitSymlink(symlink, target)

    const stats = await this.#statThroughLink(symlink)
    if (stats === undefined) {
      return
    }

    if (!stats.isDirectory()) {
      // A symlink to a file cannot have children, so it is safe to keep as a
      // link. Its target still has to be in the archive for it to resolve.
      this.#emitFile(target, targetArchivePath)
      return
    }

    const isPackageLink = isInsideNodeModules(symlink)

    // A workspace member reached through a package link is handled selectively,
    // the way the CLI treats every other workspace dependency: the link travels,
    // the member's manifest travels, whatever the include patterns matched
    // through the link travels — and the rest of the member's content is the
    // import parser's business, not a wholesale directory copy.
    //
    // Three qualifiers, each load-bearing:
    // - The store-shape check comes first: a pnpm store can live inside a member
    //   directory, and store packages need the expansion and sibling-closure
    //   treatment no matter where the store sits.
    // - The target must be the member directory itself. A link into a member's
    //   subdirectory (`link:./packages/x/dist`) names content the parser will
    //   never bundle, so it keeps expansion.
    // - The link's node_modules name must equal the member's package name. The
    //   parser resolves workspace dependencies by import specifier, so an
    //   aliased dependency (`"ui": "file:../ui"` for a package named @scope/ui)
    //   is invisible to it — selective treatment would ship an empty package.
    // The member branch is reserved for links the include patterns matched
    // (directly, or by matching files through them): those express user intent
    // the parser complements. A member link this resolver reached on its own —
    // a pnpm store package depending on a workspace member — has no parser
    // coverage at all (the parser never reads store-internal code), so it keeps
    // whole-target expansion below.
    if (
      isPackageLink
      && !this.#isPnpmStoreLocation(target)
      && this.#memberNames.has(target)
      && this.#directPaths.has(matchedPath)
    ) {
      if (this.#linkName(symlink) === this.#memberNames.get(target)) {
        // The emitted manifest is also what keeps the link alive: it occupies
        // the target, so the prune pass sees the link as resolvable. If the
        // manifest cannot be emitted, the prune drops the link rather than
        // shipping it dangling.
        await this.#emitMemberPackageJson(target)

        if (matchedPath === symlink) {
          // The include pattern named this link outright, but a workspace
          // member travels selectively — a silent narrowing worth surfacing,
          // since include exists for assets the import parser cannot see.
          this.#warnOnce(
            `${symlink}\0member`,
            `${symlink} resolves to the workspace package at ${target}. Only its manifest and `
            + `files reached through imports or matching include patterns are bundled. To bundle `
            + `other files from it, add include patterns for its own path.`,
          )
        }

        if (matchedPath !== symlink) {
          await this.#classify(path.join(target, path.relative(symlink, matchedPath)))
        }
        return
      }
    }

    // Expanding the target subtree is what puts the package's own files in the
    // archive. Do it when the pattern matched the link itself, and for package
    // links whatever the pattern's shape — `node_modules/pkg/**/*` matches only
    // files *beneath* the link, and those files alone are not enough to run.
    //
    // Do NOT expand unconditionally: for a plain directory symlink that would
    // drag in the whole target whenever a pattern merely matched something
    // inside it, so `assets/**/*.png` with a symlinked `assets` would bundle the
    // entire directory rather than the images.
    //
    // A link that points at one of its own ancestors is never expanded. pnpm
    // creates one for a package that depends on itself (`file:.`), giving
    // node_modules/<name> -> .., and expanding that would walk the whole project
    // and bundle every file the include patterns deliberately left out.
    const pointsAtAncestor = isInside(target, symlink)

    if ((matchedPath === symlink || isPackageLink) && !pointsAtAncestor) {
      await this.#expand(target)
    }

    if (isPackageLink && !pointsAtAncestor) {
      await this.#addDependencyClosure(target)
    }

    if (matchedPath !== symlink) {
      // Re-express the matched path in the real namespace and classify it there.
      // Its remaining components may contain symlinks of their own; each ends up
      // at its own real path, never nested under this link.
      await this.#classify(path.join(target, path.relative(symlink, matchedPath)))
    }

    // Whether this link survives — whether its target contributed anything, and
    // whether anything landed beneath the link itself — is only knowable once
    // every path has been classified. #pruneSymlinks decides that at the end.
  }

  /**
   * The name the link resolves as at run time — its path under the enclosing
   * node_modules directory. When this equals the target package's declared
   * name, the import parser can resolve the package; that equality is the
   * member branch's precondition.
   */
  #linkName (symlink: string): string | undefined {
    const nodeModules = enclosingNodeModules(symlink)
    if (nodeModules === undefined) {
      return undefined
    }

    return pathToPosix(path.relative(nodeModules, symlink))
  }

  /**
   * Copies an out-of-root link's content to the archive at the spelled path,
   * where it extracts as ordinary files. Nested directory links recurse
   * (anything they point at is out of root as well); the ancestor set cuts
   * cycles.
   */
  async #copyOutOfRootLink (matchedPath: string): Promise<void> {
    const archivePath = this.#archivePathOf(matchedPath)
    if (archivePath === undefined) {
      return
    }

    const stats = await this.#statThroughLink(matchedPath)
    if (stats === undefined) {
      // Dangling somewhere along the way; nothing to copy.
      return
    }

    if (!stats.isDirectory()) {
      // The bytes are readable straight through the link at the matched path,
      // which is exactly where they belong in the archive.
      this.#emitFile(matchedPath, archivePath)
      return
    }

    // The matched path itself may be a nested directory link inside the
    // out-of-root tree (glob reports such links as files); its contents belong
    // at its archive path just like the top link's do.
    await this.#copyTree(matchedPath, archivePath, new Set())
  }

  async #copyTree (directory: string, archiveDirectory: string, ancestors: Set<string>): Promise<void> {
    const real = await this.#realpath(directory)
    if (real === undefined || ancestors.has(real)) {
      return
    }

    // A directory reachable by more than one route is copied once; every later
    // route becomes a link to the first copy. Re-copying per route would take
    // time exponential in the depth of a link fan-out. If files also arrive
    // beneath a later route, that link gains children and the prune pass drops
    // it in favour of them.
    const copied = this.#copiedTrees.get(real)
    if (copied !== undefined) {
      if (copied !== archiveDirectory) {
        this.#emitSymlinkEntry(directory, archiveDirectory, copied)
      }
      return
    }
    this.#copiedTrees.set(real, archiveDirectory)

    const visited = new Set(ancestors).add(real)

    for (const entry of await this.#enumerate(real)) {
      const archivePath = path.posix.join(archiveDirectory, pathToPosix(path.relative(real, entry)))

      if (this.#isIgnoredArchivePath(archivePath)) {
        continue
      }

      const stats = await this.#lstat(entry)
      if (!stats?.isSymbolicLink()) {
        this.#emitFile(entry, archivePath)
        continue
      }

      const linkStats = await this.#statThroughLink(entry)
      if (linkStats === undefined) {
        // Dangling. A link to nothing is worth nothing on the runner.
        continue
      }

      if (linkStats.isDirectory()) {
        await this.#copyTree(entry, archivePath, visited)
        continue
      }

      this.#emitFile(entry, archivePath)
    }
  }

  /**
   * The member's manifest carries load-bearing metadata (`type`, `exports`) and
   * may exist in the archive only as the parser's faux placeholder; the real
   * one wins by the registry's prefer-physical rule.
   */
  async #emitMemberPackageJson (member: string): Promise<boolean> {
    const packageJson = path.join(member, 'package.json')
    // Stat through any link: a manifest that is itself a symlink still reads as
    // a file when the archive is built.
    const stats = await this.#statThroughLink(packageJson)
    if (stats === undefined || !stats.isFile()) {
      return false
    }

    const archivePath = this.#archivePathOf(packageJson)
    if (archivePath === undefined || this.#isIgnoredArchivePath(archivePath)) {
      return false
    }

    this.#emitFile(packageJson, archivePath)
    return true
  }

  /**
   * Marks a link whose target content arrives through the parser rather than
   * through this resolver — the prune pass must not treat its target as absent,
   * and the bundler should warn if a conflict ever forces the link out.
   */
  #markLinkReferenced (symlink: string): void {
    const archivePath = this.#archivePathOf(symlink)
    const existing = archivePath !== undefined ? this.#entries.get(archivePath) : undefined
    if (existing !== undefined && existing.symlinkTarget !== undefined) {
      existing.referencedLink = true
    }
  }

  /** Whether a real directory sits inside a pnpm store (`.pnpm/<pkg>@<v>/node_modules/...`). */
  #isPnpmStoreLocation (target: string): boolean {
    return pnpmStoreNodeModules(target) !== undefined
  }

  /**
   * Bundles a real directory that a symlink points at, and everything reachable
   * from it. Deduplicated by real path, which is what makes cyclic and diamond
   * link graphs terminate.
   */
  async #expand (directory: string): Promise<void> {
    if (this.#expanded.has(directory)) {
      return
    }
    this.#expanded.add(directory)

    debug(`Expanding symlink target ${directory}`)

    for (const entry of await this.#enumerate(directory)) {
      await this.#classify(entry)
    }
  }

  /**
   * Adds the dependency links that live alongside a package inside a pnpm store,
   * which is the only way a bundled package can resolve what it depends on.
   *
   * pnpm links node_modules/debug to .pnpm/debug@4.3.4/node_modules/debug, and
   * puts debug's own dependency ms next to that directory, at
   * .pnpm/debug@4.3.4/node_modules/ms — a *sibling* of the link's target rather
   * than something inside it. Expanding the target alone therefore produces a
   * package whose dependencies are all missing.
   *
   * Restricted to the pnpm store on purpose. The same rule applied to a package
   * inside an ordinary node_modules directory would enumerate that entire
   * directory, so a single linked package could pull in everything installed.
   *
   * Known gap: pnpm also hoists packages into node_modules/.pnpm/node_modules,
   * which Node reaches from inside the store. A package that requires something
   * it does not declare resolves through there locally, and is not collected
   * here, so it would still fail on the runner. Collecting that directory means
   * collecting every installed package, which is far too much to pay for a case
   * pnpm's own strictness makes rare.
   */
  async #addDependencyClosure (packageDirectory: string): Promise<void> {
    // A pnpm store package's node_modules directory looks like
    // <...>/.pnpm/<package>@<version>/node_modules. Anything else — including a
    // node_modules directory bundled *inside* a package — must not trigger this.
    const nodeModules = pnpmStoreNodeModules(packageDirectory)
    if (nodeModules === undefined) {
      return
    }

    if (this.#closed.has(nodeModules)) {
      return
    }
    this.#closed.add(nodeModules)

    debug(`Adding dependency closure from ${nodeModules}`)

    for (const entry of await this.#readdir(nodeModules)) {
      if (PACKAGE_MANAGER_STATE_FILES.has(entry.name)) {
        continue
      }

      const entryPath = path.join(nodeModules, entry.name)

      if (entry.isSymbolicLink()) {
        await this.#classify(entryPath)
        continue
      }

      if (!entry.isDirectory()) {
        continue
      }

      if (entry.name === BIN_DIR) {
        // Executables the package's own scripts rely on. They are ordinary
        // files that locate themselves at run time, so copying them works.
        for (const bin of await this.#readdir(entryPath)) {
          await this.#classify(path.join(entryPath, bin.name))
        }
        continue
      }

      if (entry.name.startsWith('@')) {
        // A scoped dependency is a symlink one level inside a real scope
        // directory, so the scope directory itself has to be opened.
        for (const scoped of await this.#readdir(entryPath)) {
          if (scoped.isSymbolicLink()) {
            await this.#classify(path.join(entryPath, scoped.name))
          }
        }
        continue
      }

      // A real directory here is the package itself, which #expand covers.
    }
  }

  /**
   * A broken symlink is not bundled. Whatever it points at does not exist here
   * and so cannot travel with it, leaving a link to nothing on the runner. (Were
   * it kept, #pruneSymlinks would drop it anyway, its target having no entry.)
   */
  #skipDanglingSymlink (symlink: string): void {
    this.#warnOnce(
      symlink,
      `${symlink} is a broken symlink. Skipping it.`,
    )
  }

  #emitSymlink (symlink: string, target: string): void {
    const archivePath = this.#archivePathOf(symlink)
    const targetArchivePath = this.#archivePathOf(target)
    if (archivePath === undefined || targetArchivePath === undefined) {
      return
    }

    this.#emitSymlinkEntry(symlink, archivePath, targetArchivePath)
  }

  #emitSymlinkEntry (symlink: string, archivePath: string, targetArchivePath: string): void {
    // The link target is computed between archive paths, not filesystem paths,
    // so it stays valid wherever the archive is extracted. Both are anchored to
    // '/' first: path.posix.relative() resolves bare relative paths against the
    // process's working directory, which has nothing to do with the archive.
    //
    // A link to its own parent directory relativizes to the empty string, which
    // symlink(2) rejects, so name the directory instead.
    const relativeTarget = path.posix.relative(
      path.posix.dirname(`/${archivePath}`),
      `/${targetArchivePath}`,
    )
    const symlinkTarget = relativeTarget === '' ? '.' : relativeTarget

    this.#emit(archivePath, {
      filePath: symlink,
      physical: true,
      archivePath,
      symlinkTarget,
    })
  }

  #emitFile (filePath: string, archivePath: string): void {
    this.#emit(archivePath, {
      filePath,
      physical: true,
      archivePath,
    })
  }

  #emit (key: string, file: PhysicalFile): void {
    if (this.#entries.has(key)) {
      return
    }
    this.#entries.set(key, file)
  }

  /**
   * Lists the files in a real directory. Rooted at a real path on purpose: glob
   * yields nothing at all when its cwd is a symlink.
   *
   * Dotfiles stay out, matching the include globs. That is not cosmetic — it is
   * what keeps the pnpm store, its state files and stray .env files from being
   * swept into the archive when a node_modules directory is enumerated.
   */
  async #enumerate (directory: string): Promise<string[]> {
    return await glob('**/*', {
      cwd: directory,
      nodir: true,
      absolute: true,
      dot: false,
    })
  }

  /**
   * Ignore patterns are matched against the path a file would occupy in the
   * archive, not against its path relative to the include glob's cwd.
   *
   * The cwd is the Playwright config directory, which in a monorepo sits below
   * the workspace root while the pnpm store sits at it — so a store path
   * relativized against the cwd starts with `..`, and minimatch's `**` cannot
   * swallow a `..` segment (with or without `dot`). Matching in that namespace
   * would silently ignore nothing at all for exactly the content this resolver
   * pulls in.
   *
   * The trade-off is that a pattern anchored to the cwd rather than the root —
   * `fixtures/...` rather than a globstar-prefixed one — does not apply to
   * expanded content. A pattern reaching outside the cwd has to be root-relative
   * to mean anything, and the CLI's own examples are all globstar-prefixed.
   */
  #isIgnored (file: string): boolean {
    const archivePath = this.#archivePathOf(file)
    if (archivePath === undefined) {
      // Outside the archive root, so there is no root-relative name to match.
      // Callers that know where the file will land in the archive should use
      // #isIgnoredArchivePath instead.
      const relative = pathToPosix(path.relative(this.#ignoreCwd, file))
      return this.#ignorePatterns.some(pattern => minimatch(relative, pattern, { dot: true }))
    }

    return this.#isIgnoredArchivePath(archivePath)
  }

  /**
   * Whether the ignore patterns exclude an archive path either directly or in
   * its entirety via a directory-shaped pattern. The distinction matters for
   * deciding whether a *link* counts as excluded: the pattern shape the CLI's
   * own docs teach (a globstar prefix, then the directory name, then a trailing
   * globstar) matches everything under the directory but not the bare directory
   * entry itself — a trailing globstar requires at least one segment. Probing
   * with a synthetic child answers "did the user exclude this subtree" for both
   * spellings.
   */
  #isIgnoredArchivePathOrContents (archivePath: string): boolean {
    return this.#isIgnoredArchivePath(archivePath)
      || this.#isIgnoredArchivePath(path.posix.join(archivePath, 'x'))
  }

  #isIgnoredArchivePath (archivePath: string): boolean {
    return this.#ignorePatterns.some(pattern => minimatch(archivePath, pattern, { dot: true }))
  }

  #rootOf (target: string): string | undefined {
    return this.#roots.find(root => isInside(root, target))
  }

  #archivePathOf (target: string): string | undefined {
    const root = this.#rootOf(target)
    if (root === undefined) {
      return undefined
    }

    const relative = pathToPosix(path.relative(root, target))

    // The root itself normalizes to '.', which is not a path anything is
    // archived at. Spell it as the empty string so it reads as "the root".
    return relative === '.' ? '' : relative
  }

  async #lstat (target: string): Promise<Stats | undefined> {
    const cached = this.#lstatCache.get(target)
    if (cached !== undefined || this.#lstatCache.has(target)) {
      return cached
    }

    let stats: Stats | undefined
    try {
      stats = await fs.lstat(target)
    } catch {
      stats = undefined
    }

    this.#lstatCache.set(target, stats)

    return stats
  }

  /** Stats the target of a link. Undefined when the link is broken. */
  async #statThroughLink (target: string): Promise<Stats | undefined> {
    try {
      return await fs.stat(target)
    } catch {
      return undefined
    }
  }

  /** Undefined when the path is a broken or cyclic symlink. */
  async #realpath (target: string): Promise<string | undefined> {
    try {
      return await fs.realpath(target)
    } catch {
      return undefined
    }
  }

  async #readdir (directory: string) {
    try {
      return await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return []
    }
  }

  #warnOnce (key: string, message: string): void {
    if (this.#warned.has(key)) {
      return
    }
    this.#warned.add(key)

    debug(message)
    process.stderr.write(`Warning: ${message}\n`)
  }
}

function isInside (root: string, target: string): boolean {
  return target === root || target.startsWith(root + path.sep)
}

/** Where a symlink entry's target lands, as an archive path. */
function resolveArchivePath (archivePath: string, symlinkTarget: string): string {
  const resolved = path.posix.normalize(
    path.posix.join(path.posix.dirname(`/${archivePath}`), symlinkTarget),
  )

  // Anchored at '/' so the join cannot escape into the process's working
  // directory; strip the anchor back off to get an archive path again.
  return resolved.replace(/^\/+/, '')
}

/**
 * pnpm's record of how a node_modules directory was built. Bundling one is worse
 * than useless: the runner's store directory is not the one it names, and pnpm
 * responds by purging node_modules — without asking, when CI is set.
 */
function isPackageManagerStateFile (target: string): boolean {
  return PACKAGE_MANAGER_STATE_FILES.has(path.basename(target))
    && path.basename(path.dirname(target)) === NODE_MODULES
}

/** Whether a path is a package inside a node_modules directory, scope included. */
function isInsideNodeModules (target: string): boolean {
  return enclosingNodeModules(target) !== undefined
}

/**
 * The pnpm store node_modules directory enclosing a package directory
 * (`<...>/.pnpm/<pkg>@<v>/node_modules`), or undefined when the package does
 * not sit in a store.
 */
function pnpmStoreNodeModules (packageDirectory: string): string | undefined {
  const nodeModules = enclosingNodeModules(packageDirectory)
  if (nodeModules === undefined) {
    return undefined
  }

  return path.basename(path.dirname(path.dirname(nodeModules))) === PNPM_STORE ? nodeModules : undefined
}

/**
 * The node_modules directory a package directory belongs to, looking through a
 * scope directory when there is one: node_modules/@types/node lives two levels
 * below its node_modules, not one.
 */
function enclosingNodeModules (packageDirectory: string): string | undefined {
  const parent = path.dirname(packageDirectory)
  if (path.basename(parent) === NODE_MODULES) {
    return parent
  }

  const grandParent = path.dirname(parent)
  if (path.basename(parent).startsWith('@') && path.basename(grandParent) === NODE_MODULES) {
    return grandParent
  }

  return undefined
}
