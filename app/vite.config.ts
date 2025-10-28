import path from 'node:path';
import { defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssnano from 'cssnano';
import { visualizer } from 'rollup-plugin-visualizer';

const isCI = process.env.CI === 'true';
const analyzeBundle = process.env.ANALYZE_BUNDLE === '1';

const baseConfig = defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend/data'),
    },
  },
  css: {
    postcss: {
      plugins: [
        ...(process.env.NODE_ENV === 'production'
          ? [
              cssnano({
                preset: [
                  'default',
                  { discardComments: { removeAll: true } },
                ],
              }),
            ]
          : []),
      ],
    },
  },
  build: {
    sourcemap: !isCI,
  },
});

export default mergeConfig(baseConfig, {
  test: undefined,
  plugins: [
    ...(analyzeBundle
      ? [
          visualizer({
            filename: path.resolve(__dirname, 'metrics/bundle-visualizer.html'),
            template: 'treemap',
            gzipSize: true,
            brotliSize: true,
          }),
        ]
      : []),
  ],
});
