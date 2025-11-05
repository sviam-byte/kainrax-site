import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  output: 'static',
  vite: {
    resolve: {
      alias: {
        '@content': fileURLToPath(new URL('./content', import.meta.url)),
      },
    },
  },
});
