import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright specs live in e2e/ and run from the root config.
export default defineConfig({
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
