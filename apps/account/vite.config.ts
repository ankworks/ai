import { reactAppConfig } from '../../packages/build/src/react.ts';

// Path mode: served under `/account/` by the API Worker's static assets.
export default reactAppConfig({ port: 5175, basePath: '/account/' });
