const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure singleton React & Expo UI modules always resolve from example/node_modules
const singletons = [
  'react',
  'react-dom',
  'react-native',
  'react-native-web',
  '@expo/ui',
  'ajv',
  'ajv-formats',
];

config.resolver.extraNodeModules = Object.fromEntries(
  singletons.map((pkg) => [pkg, path.resolve(projectRoot, 'node_modules', pkg)])
);

const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  for (const pkg of singletons) {
    if (moduleName === pkg || moduleName.startsWith(`${pkg}/`)) {
      const redirectedOrigin = path.join(projectRoot, 'package.json');
      const nextCtx = { ...context, originModulePath: redirectedOrigin };
      return upstreamResolveRequest
        ? upstreamResolveRequest(nextCtx, moduleName, platform)
        : context.resolveRequest(nextCtx, moduleName, platform);
    }
  }
  return upstreamResolveRequest
    ? upstreamResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
