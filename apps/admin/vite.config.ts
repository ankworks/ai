import { reactAppConfig } from '../../packages/build/src/react.ts';

// Path mode: served under `/admin/` by the API Worker's static assets.
export default reactAppConfig({ port: 5176, basePath: '/admin/' });
