import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Most tests are pure logic and run in Node. A file that needs the DOM opts in to
    // jsdom with a `// @vitest-environment jsdom` comment on its first line (creating
    // jsdom for every file was most of the run time).
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/setup.ts'],
  },
});
