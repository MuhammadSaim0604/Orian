/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  // Every one of these ships untranspiled ESM, so Jest must transform it rather than treat it as
  // a plain CommonJS dependency. The `.pnpm/` alternative is needed because pnpm's store puts the
  // real package behind a hashed directory, so the path is
  // `node_modules/.pnpm/<pkg>@<version>_<hash>/node_modules/<pkg>` and the pattern has to match at
  // both positions.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?(react-native|@react-native|react-native-.*|@shopify|nativewind|react-native-css-interop))',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}'],
};
