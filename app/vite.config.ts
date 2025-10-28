import path from 'node:path';
import { createRequire } from 'node:module';
import { createLogger, defineConfig, mergeConfig } from 'vite';
import react from '@vitejs/plugin-react';
import cssnano from 'cssnano';
import { visualizer } from 'rollup-plugin-visualizer';

const require = createRequire(import.meta.url);
require('../tests/suppress-sass-warnings.cjs');

if (!process.env.SASS_SILENCE_DEPRECATIONS) {
  process.env.SASS_SILENCE_DEPRECATIONS = 'all';
}

if (!process.env.SASS_SUPPRESS_DEPRECATIONS) {
  process.env.SASS_SUPPRESS_DEPRECATIONS = '1';
}

const isCI = process.env.CI === 'true';
const analyzeBundle = process.env.ANALYZE_BUNDLE === '1';

const viteLogger = createLogger();

const filteredLogger = {
  ...viteLogger,
  warn(msg, options) {
    if (typeof msg === 'string' && msg.includes('legacy-js-api')) {
      return;
    }
    viteLogger.warn(msg, options);
  },
  info(msg, options) {
    if (typeof msg === 'string' && msg.includes('legacy-js-api')) {
      return;
    }
    viteLogger.info(msg, options);
  },
};

const baseConfig = defineConfig({
  plugins: [react()],
  customLogger: filteredLogger,
  resolve: {
    alias: {
      '#fixtures': path.resolve(__dirname, '../tests/fixtures/backend/data'),
    },
  },
  define: {
    'import.meta.env.VITE_CONSOLE_USE_FIXTURES': JSON.stringify(
      (() => {
        const preference = process.env.CONSOLE_MCP_USE_FIXTURES?.trim().toLowerCase();
        if (preference === 'off') {
          return false;
        }
        return true;
      })(),
    ),
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
