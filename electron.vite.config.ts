import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// Relative to project root — consistent across all machines since npm always
// installs packages under node_modules/ at the repo root.
const vadDist = 'node_modules/@ricky0123/vad-web/dist'
const ortDist = 'node_modules/onnxruntime-web/dist'

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
    // In dev mode the renderer loads from the Vite HTTP server, so we must set
    // COOP/COEP there directly — webRequest.onHeadersReceived fires too late for
    // the initial document and SharedArrayBuffer stays undefined without this.
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
      },
    },
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
          // VAD AudioWorklet + Silero ONNX models
          { src: `${vadDist}/vad.worklet.bundle.min.js`, dest: '.' },
          { src: `${vadDist}/silero_vad_v5.onnx`, dest: '.' },
          { src: `${vadDist}/silero_vad_legacy.onnx`, dest: '.' },
          // ONNX Runtime WASM binaries required by onnxruntime-web inside vad-web
          { src: `${ortDist}/ort-wasm-simd-threaded.wasm`, dest: '.' },
          { src: `${ortDist}/ort-wasm-simd-threaded.asyncify.wasm`, dest: '.' },
        ],
      }),
    ],
  },
})
