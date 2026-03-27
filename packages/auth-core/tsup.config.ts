import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  external: ['@flowindex/flow-passkey', '@react-native-async-storage/async-storage'],
  esbuildOptions(options) {
    options.resolveExtensions = ['.web.ts', '.web.tsx', '.ts', '.tsx', '.js', '.jsx'];
  },
});
