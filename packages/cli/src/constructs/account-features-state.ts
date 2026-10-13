/**
 * The account's feature flags. Lives outside of Session so that commands can
 * set it without importing Session, which pulls in the parser, file loaders
 * and bundlers.
 */
export const accountFeaturesState: { features: string[] } = { features: [] }
