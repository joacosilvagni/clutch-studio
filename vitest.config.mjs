import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['pipeline/test/**/*.test.mjs', 'worker/test/**/*.test.ts'],
    environment: 'node',
  },
});
