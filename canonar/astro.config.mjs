import { defineConfig } from 'astro/config';
export default defineConfig({
  base: '/',                // важное отличие от варианта с под-путём
  site: 'https://canonar.<твой-домен>', // опционально, но полезно
  output: 'static'
});
