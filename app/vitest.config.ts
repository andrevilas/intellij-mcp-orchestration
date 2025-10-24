import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig(async () => {
  const config = await viteConfig();

  return mergeConfig(config, {
    test: {
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      globals: true,
    },
  });
});
