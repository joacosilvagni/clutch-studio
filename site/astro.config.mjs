// @ts-check
import { defineConfig } from 'astro/config';

// TODO: real domain once the brand name is final.
export default defineConfig({
  site: 'https://example.com',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
