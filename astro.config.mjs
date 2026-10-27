import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://nandogomez.com',
  trailingSlash: 'never',
  build: {
    format: 'file',
    inlineStylesheets: 'never',
  },
  vite: {
    build: {
      assetsInlineLimit: 0,
    },
  },
});
