import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['dist/**', 'storybook-static/**', 'node_modules/**'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
