/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['<rootDir>/src/**/*.test.{ts,tsx}'],
  moduleNameMapper: {
    // Metro compiles the stylesheet into NativeWind styles; Jest would try to parse `@tailwind` as
    // JavaScript and die on the first line. Anything importing the app root needs this, since
    // `App.tsx` imports the stylesheet for its side effect. Mapped to Jest's own empty module rather
    // than a stub file, so there is no CommonJS source in `src` for ESLint to object to.
    '\\.css$': 'identity-obj-proxy',
  },
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
