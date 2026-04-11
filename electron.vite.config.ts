import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Relative to project root — consistent across all machines since npm always
// installs packages under node_modules/ at the repo root.
const vadDist = 'node_modules/@ricky0123/vad-web/dist'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      // Copies VAD worker + ONNX model files into the renderer output root so
      // @ricky0123/vad-web can load them via its asset-path resolution logic.
      // In dev mode the plugin serves them directly; in production they land in
      // out/renderer/ alongside index.html.
      viteStaticCopy({
        targets: [
          { src: `${vadDist}/vad.worklet.bundle.min.js`, dest: '.' },
          { src: `${vadDist}/silero_vad_v5.onnx`, dest: '.' },
          { src: `${vadDist}/silero_vad_legacy.onnx`, dest: '.' },
        ],
      }),
    ],
  },
})
