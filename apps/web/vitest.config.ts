import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    exclude: ['**/node_modules/**', '**/.next/**', '**/src/api/generated/**'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    maxWorkers: 2,
    setupFiles: ['./test/setup.ts'],
  },
});
