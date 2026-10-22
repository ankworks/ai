import { reactAppConfig } from '../../packages/build/src/react.ts';

// Path mode: served under `/status/` by the API Worker's static assets.
export default reactAppConfig({ port: 5177, basePath: '/status/' });
