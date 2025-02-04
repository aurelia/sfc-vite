import { nodeResolve } from '@rollup/plugin-node-resolve';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/index.js',
    format: 'esm',
    sourcemap: true
  },
  plugins: [nodeResolve()],
  external: [
    "fs",
    "path",
    "crypto",
    "typescript",
    "node-html-parser",
    "sass",
    "stylus"
  ]
};
