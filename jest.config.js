/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['./nt-web-app/recorder'],
  testMatch: ['**/*.test.ts'],
};
