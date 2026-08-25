const path = require('node:path');

const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withNativeWind } = require('nativewind/metro');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

/**
 * Metro must be told about the monorepo: watch the workspace root so changes in
 * `packages/*` hot-reload, and resolve modules from both node_modules trees
 * because pnpm hoists differently from npm.
 */
const config = mergeConfig(getDefaultConfig(projectRoot), {
  projectRoot,
  watchFolders: [workspaceRoot],
  resolver: {
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(workspaceRoot, 'node_modules'),
    ],
    // pnpm uses symlinks; Metro needs to follow them rather than treat each
    // linked package as a separate copy of React.
    unstable_enableSymlinks: true,
    disableHierarchicalLookup: false,
  },
});

module.exports = withNativeWind(config, { input: './src/global.css' });
