import manifest from '../../../package.json' with { type: 'json' };

export const APP_VERSION: string = manifest.version;
