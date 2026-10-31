import { defineConfig } from 'orval';

export default defineConfig({
  plg: {
    input: { target: '../../packages/api-client/openapi.json' },
    output: {
      clean: true,
      client: 'react-query',
      mode: 'tags-split',
      schemas: './src/api/generated/models',
      target: './src/api/generated/api.ts',
      override: {
        mutator: { name: 'plgGeneratedFetch', path: './src/api/browser/orval-mutator.ts' },
        query: { signal: true },
      },
    },
  },
});
