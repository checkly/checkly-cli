import prompts from 'prompts'

/**
 * `prompts`, rendering on stderr instead of stdout. A question is never a
 * command's result, and stdout may be piped into a parser while a person
 * answers on the terminal.
 */
export function prompt<T extends string = string> (
  question: prompts.PromptObject<T>,
  options?: prompts.Options,
): Promise<prompts.Answers<T>> {
  return prompts({ stdout: process.stderr, ...question }, options)
}
