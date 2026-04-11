import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteStaticCopy } from 'vite-plugin-static-copy'

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
      // Copies the browser-ready VAD/ORT runtime into an app-owned vad-runtime/
      // directory so the renderer can load it via local script tags instead of
      // importing either package through Vite.
      viteStaticCopy({
        targets: [
          { src: `${vadDist}/bundle.min.js`, dest: 'vad-runtime', rename: { stripBase: true } },
          { src: `${vadDist}/vad.worklet.bundle.min.js`, dest: 'vad-runtime', rename: { stripBase: true } },
          { src: `${vadDist}/silero_vad_v5.onnx`, dest: 'vad-runtime', rename: { stripBase: true } },
          { src: `${vadDist}/silero_vad_legacy.onnx`, dest: 'vad-runtime', rename: { stripBase: true } },
          { src: `${ortDist}/ort.min.js`, dest: 'vad-runtime', rename: { stripBase: true } },
          { src: `${ortDist}/ort-wasm*`, dest: 'vad-runtime', rename: { stripBase: true } },
        ],
      }),
    ],
  },
})
