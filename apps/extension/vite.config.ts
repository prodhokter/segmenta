import { resolve } from 'path';
import { defineConfig, Plugin } from 'vite';
import fs from 'fs';

function copyManifestAndIconsPlugin(): Plugin {
  return {
    name: 'copy-manifest-and-icons',
    closeBundle() {
      const manifestSrc = resolve(__dirname, 'manifest.json');
      const manifestDest = resolve(__dirname, 'dist/manifest.json');
      if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, manifestDest);
      }

      const iconsSrcDir = resolve(__dirname, 'icons');
      const iconsDestDir = resolve(__dirname, 'dist/icons');
      if (fs.existsSync(iconsSrcDir)) {
        if (!fs.existsSync(iconsDestDir)) {
          fs.mkdirSync(iconsDestDir, { recursive: true });
        }
        for (const file of fs.readdirSync(iconsSrcDir)) {
          fs.copyFileSync(resolve(iconsSrcDir, file), resolve(iconsDestDir, file));
        }
      }
    },
  };
}

export default defineConfig({
  plugins: [copyManifestAndIconsPlugin()],
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
