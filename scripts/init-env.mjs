/**
 * Copies .env.example → .env if .env does not already exist.
 * Always exits 0 — this is a convenience step, not a hard failure.
 *
 * Usage:
 *   node scripts/init-env.mjs
 *   npm run init:env
 */

import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const examplePath = join(rootDir, '.env.example')
const envPath = join(rootDir, '.env')

if (existsSync(envPath)) {
  console.log('[init-env] ✅ .env already exists — skipping.')
} else if (!existsSync(examplePath)) {
  console.warn('[init-env] ⚠️  .env.example not found — cannot create .env.')
} else {
  copyFileSync(examplePath, envPath)
  console.log('[init-env] ✅ Created .env from .env.example.')
  console.log('[init-env]    Edit .env if you need to change ports, backends, or WSL2 settings.')
}
