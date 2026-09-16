import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
  // O workspace `shared` é TypeScript cru — precisa ser empacotado junto, ao
  // contrário das dependências de node_modules, que ficam externas.
  noExternal: ['@viciotown/shared'],
});
