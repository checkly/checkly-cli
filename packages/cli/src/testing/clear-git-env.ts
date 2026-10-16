import { execFileSync } from 'node:child_process'

// Git exports variables such as GIT_DIR, GIT_WORK_TREE and GIT_INDEX_FILE to the
// commands it spawns (`git rebase -x`, hooks). A test inheriting them that runs
// `git init` in a temp directory re-initialises that outer repository instead:
// inside a linked worktree this writes core.bare=true into the main repository's
// config and breaks every checkout. Removing them from process.env before any
// test runs also covers the child processes tests spawn, which inherit it.
// Loaded as a setupFile in each test worker, and by global-setup.ts in the main
// process. packages/create-cli/e2e/clear-git-env.ts is a copy; change both.
function repositoryLocalEnvVars (): string[] {
  try {
    // Lists exactly the variables git itself clears when it switches repositories.
    return execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
  } catch {
    // Without git installed no test can run it, so there is nothing to clear.
    return []
  }
}

for (const name of repositoryLocalEnvVars()) {
  delete process.env[name]
}
