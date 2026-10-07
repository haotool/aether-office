import manifest from '../../../package.json' with { type: 'json' };

/** The version the product reports (health, A2A card, MCP and ACP client info): the root package.json is the only place it is written. */
export const APP_VERSION: string = manifest.version;
