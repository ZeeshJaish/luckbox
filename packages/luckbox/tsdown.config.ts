import { defineConfig } from 'tsdown'

export default defineConfig([
  // npm builds: ESM + CommonJS, each with its own type definitions.
  // Add-ons are separate entries so apps only download what they import.
  {
    entry: { index: 'src/index.ts', noise: 'src/noise.ts', seedrandom: 'src/seedrandom.ts', names: 'src/names.ts' },
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2022',
    dts: true,
    sourcemap: false,
    clean: true,
  },
  // The `npx luckbox` command (Node only, never imported by apps).
  {
    entry: { cli: 'src/cli.ts' },
    format: 'esm',
    platform: 'node',
    target: 'node20',
    dts: false,
    clean: false,
    outputOptions: { banner: '#!/usr/bin/env node' },
  },
  // One-file build for <script> tags (single-file HTML games, CDNs).
  // Exposes everything on window.luckbox, add-ons included.
  {
    entry: { luckbox: 'src/global.ts' },
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
