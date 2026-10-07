// vitest.config.ts
import { defineConfig } from 'vitest/config';
import path from 'path';
import os from 'os';

const testDbPath = path.join(os.tmpdir(), 'swap-monitor-test.db');

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    env: {
      DATABASE_PATH: testDbPath,
      MOCK_MODE: 'true',
      TELEGRAM_ENABLED: 'false',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/dashboard/**', 'src/index.ts'],
    },
  },
});
