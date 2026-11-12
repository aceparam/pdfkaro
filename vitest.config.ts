import { defineConfig } from 'vitest/config';

export default defineConfig({
  // As in astro.config.mjs: PDF.js's Type 1 fonts and decoders are bundled as data.
  assetsInclude: ['**/*.pfb', '**/*.wasm'],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.{ts,tsx}'],
  },
});
