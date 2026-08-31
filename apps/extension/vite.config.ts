import { resolve } from 'path';
import { defineConfig, Plugin } from 'vite';
import fs from 'fs';

function copyManifestPlugin(): Plugin {
  return {
    name: 'copy-manifest',
    closeBundle() {
      const manifestSrc = resolve(__dirname, 'manifest.json');
      const manifestDest = resolve(__dirname, 'dist/manifest.json');
      if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, manifestDest);
      }
    },
  };
}

export default defineConfig({
  plugins: [copyManifestPlugin()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background/index.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') return 'src/background/index.js';
          if (chunkInfo.name === 'content') return 'src/content/index.js';
          if (chunkInfo.name === 'popup') return 'src/popup/index.js';
          return '[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
