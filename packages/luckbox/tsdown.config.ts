import { defineConfig } from 'tsdown'

export default defineConfig([
  // npm builds: ESM + CommonJS, each with its own type definitions.
  {
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    sourcemap: false,
    clean: true,
  },
  // One-file build for <script> tags (single-file HTML games, CDNs).
  // Exposes everything on window.luckbox.
  {
    entry: { luckbox: 'src/index.ts' },
    format: 'iife',
    globalName: 'luckbox',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    dts: false,
    clean: false,
    outputOptions: { entryFileNames: 'luckbox.min.js' },
  },
])
