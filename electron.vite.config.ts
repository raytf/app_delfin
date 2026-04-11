import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import type { Plugin } from 'vite'

/**
 * Vite pre-bundles @ricky0123/vad-web and in doing so transforms ORT's
 * dynamic import() calls, appending "?import" to the URL as a module-type
 * hint (e.g. /ort-wasm-simd-threaded.mjs?import).
 *
 * viteStaticCopy serves the file without that query param, so the request
 * returns 404. This middleware strips "?import" from any ORT WASM glue-
 * module URL before it reaches the static file handler, making the lookup
 * succeed. Only affects dev mode; production uses file:// which doesn't go
 * through this server.
 */
function ortWasmDevServePlugin(): Plugin {
  return {
    name: 'ort-wasm-dev-serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url?.match(/ort-wasm[^?]*\.mjs\?/)) {
          req.url = req.url.split('?')[0]
        }
        next()
      })
    },
  }
}

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
      // Strips ?import query param from ORT .mjs dynamic-import URLs in dev mode.
      // Vite appends ?import to dynamic imports; static copy serves without it → 404.
      ortWasmDevServePlugin(),
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
          // ONNX Runtime WASM binaries + JS glue modules required by onnxruntime-web.
          // ORT dynamically imports the .mjs companion alongside the .wasm binary,
          // so both must be served at the same path root.
          { src: `${ortDist}/ort-wasm-simd-threaded.wasm`, dest: '.' },
          { src: `${ortDist}/ort-wasm-simd-threaded.mjs`, dest: '.' },
          { src: `${ortDist}/ort-wasm-simd-threaded.asyncify.wasm`, dest: '.' },
          { src: `${ortDist}/ort-wasm-simd-threaded.asyncify.mjs`, dest: '.' },
        ],
      }),
    ],
  },
})
