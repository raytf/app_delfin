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

// Absolute paths — viteStaticCopy resolves 'src' relative to the Vite root,
// which for the renderer in electron-vite is src/renderer, not the repo root.
// resolve() on Windows returns backslash paths; viteStaticCopy's glob engine
// requires forward slashes, so we normalise after resolving.
const fwd = (p: string) => p.replace(/\\/g, '/')
const vadDist = fwd(resolve('node_modules/@ricky0123/vad-web/dist'))
const ortDist = fwd(resolve('node_modules/onnxruntime-web/dist'))

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
    optimizeDeps: {
      // ORT's dynamic wasm-loader imports do not survive Vite's dep optimizer
      // in dev mode. Keep both packages unbundled so their runtime asset paths
      // remain stable and load from the served package files instead of
      // node_modules/.vite/deps/... cache paths.
      exclude: ['@ricky0123/vad-web', 'onnxruntime-web'],
    },
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
      // Copies VAD worker + ONNX model files into an app-owned vad-assets/
      // directory. This avoids runtime dependence on node_modules/... paths and
      // keeps dev/prod asset URLs stable.
      viteStaticCopy({
        targets: [
          // VAD AudioWorklet + Silero ONNX models
          { src: `${vadDist}/vad.worklet.bundle.min.js`, dest: 'vad-assets', rename: { stripBase: true } },
          { src: `${vadDist}/silero_vad_v5.onnx`, dest: 'vad-assets', rename: { stripBase: true } },
          { src: `${vadDist}/silero_vad_legacy.onnx`, dest: 'vad-assets', rename: { stripBase: true } },
          // ONNX Runtime WASM binaries + JS glue modules required by onnxruntime-web.
          // ORT dynamically imports the .mjs companion alongside the .wasm binary,
          // so both must be served under the same stable vad-assets/ prefix.
          { src: `${ortDist}/ort-wasm-simd-threaded.wasm`, dest: 'vad-assets', rename: { stripBase: true } },
          { src: `${ortDist}/ort-wasm-simd-threaded.mjs`, dest: 'vad-assets', rename: { stripBase: true } },
          { src: `${ortDist}/ort-wasm-simd-threaded.asyncify.wasm`, dest: 'vad-assets', rename: { stripBase: true } },
          { src: `${ortDist}/ort-wasm-simd-threaded.asyncify.mjs`, dest: 'vad-assets', rename: { stripBase: true } },
        ],
      }),
    ],
  },
})
