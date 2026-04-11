/**
 * Compares .env keys against .env.example and warns about any that are missing.
 * Always exits 0 — this is a warning-only check, not a hard failure.
 *
 * Usage:
 *   node scripts/check-env.mjs
 *   npm run check:env
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const examplePath = join(rootDir, '.env.example')
const envPath = join(rootDir, '.env')

/** Extract variable names from a .env-style file, skipping comments and blanks. */
function parseKeys(filePath) {
  return readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && line.includes('='))
    .map((line) => line.slice(0, line.indexOf('=')).trim())
    .filter(Boolean)
}

if (!existsSync(examplePath)) {
  console.log('[check-env] .env.example not found — skipping.')
  process.exit(0)
}

if (!existsSync(envPath)) {
  console.warn('[check-env] ⚠️  .env not found.')
  console.warn('[check-env]    Run: cp .env.example .env  (then adjust for your machine)')
  process.exit(0)
}

const exampleKeys = parseKeys(examplePath)
const envKeys = new Set(parseKeys(envPath))
const missing = exampleKeys.filter((k) => !envKeys.has(k))

if (missing.length === 0) {
  console.log('[check-env] ✅ .env has all keys from .env.example.')
} else {
  console.warn('[check-env] ⚠️  .env is missing the following keys from .env.example:')
  for (const key of missing) {
    console.warn(`[check-env]     - ${key}`)
  }
  console.warn('[check-env]    Copy the missing values from .env.example and adjust for your machine.')
}
