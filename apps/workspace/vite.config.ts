import { reactAppConfig } from '../../packages/build/src/react.ts';

// Path mode: served under `/app/` by the API Worker's static assets.
export default reactAppConfig({ port: 5174, basePath: '/app/' });
