import { defineConfig } from 'vitest/config';

// Kept separate from vite.config.ts, which loads vinext and the Cloudflare
// plugin; the simulation core is plain TypeScript and needs neither.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
