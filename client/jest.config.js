/**
 * JEST CONFIGURATION
 *
 * Test setup for the client. The ts-jest preset compiles TypeScript on the fly,
 * and the environment is deliberately 'node' rather than 'jsdom': the suite
 * covers the framework-independent domain classes, not React components, so no
 * DOM is required.
 *
 * `testMatch` restricts discovery to `src/__tests__/**\/*.test.ts`, and coverage
 * is collected from `src/classes` alone - the classes are the tested surface,
 * and including untested component files would make the figure meaningless.
 *
 * Usage: `npm test`, `npm run test:watch`, `npm run test:coverage` from client/.
 *
 * Connections:
 *   - client/src/__tests__/    - the suites this discovers.
 *   - client/src/classes/      - the code under test and the coverage scope.
 *   - client/package.json      - the npm scripts that invoke Jest.
 *
 * Note: coverage output is written to client/coverage/, which is committed to
 * the repository; it is generated and is listed in the dead-file audit.
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
