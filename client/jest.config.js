/**
 * JEST TEST CONFIGURATION - Testing setup for the Homey client application
 * Configures Jest testing framework with TypeScript support and node environment.
 * Sets up test file discovery, coverage reporting, and module path resolution.
 * Enables unit testing for classes, components, and utility functions.
 * Provides foundation for test-driven development and code quality assurance.
 */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/classes/**/*.ts',
    '!src/classes/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};
