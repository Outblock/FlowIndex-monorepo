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

// Node.js built-in module polyfills — required by @onflow/fcl (bundles node-fetch)
config.resolver.extraNodeModules = {
  http: require.resolve('@tradle/react-native-http'),
  https: require.resolve('https-browserify'),
  stream: require.resolve('stream-browserify'),
  zlib: require.resolve('browserify-zlib'),
  buffer: require.resolve('buffer/'),
  url: require.resolve('react-native-url-polyfill'),
  events: require.resolve('events/'),
  process: require.resolve('process/browser'),
  crypto: require.resolve('react-native-crypto'),
};

// Ensure monorepo packages are not treated as external
config.resolver.disableHierarchicalLookup = false;

module.exports = config;
