import { reactAppConfig } from '../../packages/build/src/react.ts';

// Path mode: web is the root SPA at `/` (see scripts/assemble-assets.mjs).
export default reactAppConfig({ port: 5173, basePath: '/' });
