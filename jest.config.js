/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/*.ts'],
  setupFilesAfterEnv: ['<rootDir>/tests/config/setup.ts'],
};
