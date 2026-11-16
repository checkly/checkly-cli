import { lineComment, singleLineCommentText, TrailingCommentValue, Value } from '../../../sourcegen/index.js'

/**
 * A reference to a resource by ID, with the resource's name as a trailing
 * line comment when the name is known: `CheckGroupV2.fromId(42), // Backend`.
 * A name that is empty once made safe for a line comment adds nothing.
 */
export function namedReference (value: Value, name: string | undefined): Value {
  const text = name === undefined ? '' : singleLineCommentText(name)
  return text === '' ? value : new TrailingCommentValue(value, lineComment(text))
}
