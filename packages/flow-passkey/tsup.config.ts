import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@onflow/fcl', 'react-native-passkeys'],
  esbuildOptions(options) {
    options.resolveExtensions = ['.web.ts', '.web.tsx', '.ts', '.tsx', '.js', '.jsx'];
  },
});
