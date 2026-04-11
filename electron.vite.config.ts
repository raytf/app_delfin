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
    //
    // COEP is set to 'credentialless' rather than 'require-corp':
    //   - 'require-corp' blocks any cross-origin resource that lacks an explicit
    //     Cross-Origin-Resource-Policy header, which Electron internals may not set.
    //   - 'credentialless' allows cross-origin loads but strips cookies/auth,
    //     which is sufficient to satisfy cross-origin isolation and unlock
    //     SharedArrayBuffer without breaking Electron's internal resource loading.
    server: {
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
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
