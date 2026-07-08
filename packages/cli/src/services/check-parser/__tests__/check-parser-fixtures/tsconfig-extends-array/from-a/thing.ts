// Present so that a wrongly-applied precedence (config A winning over B) would
// resolve here instead of from-b, making the precedence bug observable.
export const thing = 'from-a'
