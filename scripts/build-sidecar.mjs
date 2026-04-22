/**
 * Build script: freeze the Python sidecar into a standalone directory using PyInstaller.
 *
 * The frozen artefact is placed in:
 *   dist/sidecar/<platform-tag>/
 *
 * Platform tags:
 *   win-x64 | macos-arm64 | macos-x64 | linux-x64
 *
 * Run with: npm run build:sidecar
 *
 * Pre-requisites:
 *   - Sidecar virtualenv is created (npm run setup:sidecar)
 *   - MODEL_REPO / MODEL_FILE env vars are available at *runtime*, not build time.
 */

import { spawnSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync, cpSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const sidecarDir = join(rootDir, "sidecar")
const distDir = join(rootDir, "dist", "sidecar")

function resolveVenvPython() {
  const venvPython =
    process.platform === "win32"
      ? join(sidecarDir, ".venv", "Scripts", "python.exe")
      : join(sidecarDir, ".venv", "bin", "python")
  return existsSync(venvPython) ? venvPython : null
}

function getPlatformTag() {
  const platform = process.platform
  const arch = process.arch
  if (platform === "win32") return "win-x64"
  if (platform === "darwin") return arch === "arm64" ? "macos-arm64" : "macos-x64"
  if (platform === "linux") return "linux-x64"
  return `${platform}-${arch}`
}

// ---------------------------------------------------------------------------
// Resolve Python interpreter
// ---------------------------------------------------------------------------
const venvPython = resolveVenvPython()
if (venvPython === null) {
  console.error(
    "[build-sidecar] No sidecar virtualenv Python found. Run `npm run setup:sidecar` first."
  )
  process.exit(1)
}

const platformTag = getPlatformTag()
console.log(`[build-sidecar] Building frozen sidecar for ${platformTag}...`)

// ---------------------------------------------------------------------------
// Clean stale PyInstaller work directories
// ---------------------------------------------------------------------------
const pyiBuildDir = join(sidecarDir, "build")
const pyiDistDir = join(sidecarDir, "dist")
if (existsSync(pyiBuildDir)) rmSync(pyiBuildDir, { recursive: true })
if (existsSync(pyiDistDir)) rmSync(pyiDistDir, { recursive: true })

// ---------------------------------------------------------------------------
// Run PyInstaller against the spec file
// ---------------------------------------------------------------------------
const pyiArgs = ["-m", "PyInstaller", "delfin-sidecar.spec", "--clean", "--noconfirm"]

console.log(`[build-sidecar] ${venvPython} ${pyiArgs.join(" ")}`)

const result = spawnSync(venvPython, pyiArgs, {
  cwd: sidecarDir,
  stdio: "inherit",
  env: { ...process.env },
})

if (result.status !== 0) {
  console.error("[build-sidecar] PyInstaller failed.")
  process.exit(result.status ?? 1)
}

// ---------------------------------------------------------------------------
// Copy result into dist/sidecar/<platform-tag>/
// ---------------------------------------------------------------------------
const srcOutputDir = join(sidecarDir, "dist", "delfin-sidecar")
if (!existsSync(srcOutputDir)) {
  console.error(`[build-sidecar] Expected output not found at ${srcOutputDir}`)
  process.exit(1)
}

const platformDir = join(distDir, platformTag)
if (existsSync(platformDir)) rmSync(platformDir, { recursive: true })
mkdirSync(platformDir, { recursive: true })

cpSync(srcOutputDir, platformDir, { recursive: true })

console.log(`[build-sidecar] ✅ Frozen sidecar copied to ${platformDir}`)
