import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Measure the shipped source, not the tests or the build output.
      include: ['src/**'],
      reporter: ['text', 'html', 'lcov'],
      // Every statement, branch, function and line of src/ is covered, and the
      // bars are set there so a newly uncovered path fails the run instead of
      // slipping in. No per-line ignore pragmas are used: the handful of arms
      // that no input could reach were removed from the source rather than
      // excused here.
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        branches: 100,
      },
    },
  },
})
