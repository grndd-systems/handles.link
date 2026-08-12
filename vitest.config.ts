import { defineConfig } from 'vitest/config'

// Only the pure units run under vitest (config parsing, platform
// enablement, chain-id guards) — nothing here touches the DOM, so the
// default node environment is right.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts'],
  },
})
