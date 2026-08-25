/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?(react-native|@react-native|react-native-.*|nativewind|react-native-css-interop))',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
};
