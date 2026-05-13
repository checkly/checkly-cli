export { detectProjectContext, type ProjectContext } from './detect-project.js'
export { loadPromptTemplate, type PromptVariables } from './template-prompt.js'
export { displayStarterPrompt } from './prompt-display.js'
export { runSkillInstallStep, refreshSkill, type SkillInstallResult } from './skill-install.js'
export {
  runDepsInstall,
  createConfig,
  copyChecks,
  type ConfigCreationResult,
  type DepsInstallOptions,
  type DepsInstallResult,
} from './boilerplate.js'
export { makeOnCancel, successMessage } from './prompts-helpers.js'
export { greeting, footer, agentFooter, noSkillWarning, existingProjectFooter } from './messages.js'
