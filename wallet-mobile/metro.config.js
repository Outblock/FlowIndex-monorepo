const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// Resolve react-native condition in package.json exports
// so workspace packages serve source (.native.ts) instead of pre-built dist
config.resolver.unstable_conditionNames = ['react-native', 'require', 'import'];

// Ensure monorepo packages are not treated as external
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
