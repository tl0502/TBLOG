#!/usr/bin/env node
/**
 * Reset the local D1 administrator to a known username/password for development.
 *
 * Usage:
 *   node scripts/reset-local-admin.mjs
 *   node scripts/reset-local-admin.mjs --username admin --password admin123456789
 */
import Database from 'better-sqlite3'
import { randomBytes, pbkdf2Sync } from 'node:crypto'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseArgs(argv) {
  const options = { username: 'admin', password: 'admin123456789' }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--username' && argv[i + 1]) {
      options.username = argv[++i]
    } else if (arg === '--password' && argv[i + 1]) {
      options.password = argv[++i]
    }
  }
  return options
}

function findLocalD1Path() {
  const dir = join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')
  let candidates = []
  try {
    candidates = readdirSync(dir)
      .filter((name) => name.endsWith('.sqlite') && !name.includes('metadata'))
      .map((name) => join(dir, name))
  } catch {
    throw new Error('Local D1 database not found. Run migrations / start the app once first.')
  }
  if (candidates.length === 0) {
    throw new Error('No local D1 .sqlite file under .wrangler/state/v3/d1/.')
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0]
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url')
}

/** Match server/utils/auth-crypto.ts: pbkdf2-sha256$100000$salt$hash */
function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, 100_000, 32, 'sha256')
  return ['pbkdf2-sha256', '100000', toBase64Url(salt), toBase64Url(hash)].join('$')
}

function main() {
  const { username, password } = parseArgs(process.argv.slice(2))
  if (!username.trim()) throw new Error('username is required')
  if (password.length < 12) throw new Error('password must be at least 12 characters (same as setup)')

  const dbPath = findLocalD1Path()
  console.log(`[reset-local-admin] database: ${dbPath}`)

  const passwordHash = hashPassword(password)
  const now = Date.now()
  const db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  const rows = db.prepare('SELECT id, username FROM administrators ORDER BY created_at ASC').all()
  console.log('[reset-local-admin] before:', rows)

  let adminId
  if (rows.length === 0) {
    adminId = randomBytes(16).toString('hex')
    db.prepare(`
      INSERT INTO administrators (id, username, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(adminId, username, passwordHash, now, now)
    console.log(`[reset-local-admin] created administrator ${adminId}`)
  } else {
    const named = rows.find((row) => row.username === username)
    adminId = named?.id ?? rows[0].id
    db.prepare(`
      UPDATE administrators
      SET username = ?, password_hash = ?, updated_at = ?
      WHERE id = ?
    `).run(username, passwordHash, now, adminId)
    console.log(`[reset-local-admin] updated administrator ${adminId}`)
  }

  try {
    const cleared = db.prepare('DELETE FROM sessions WHERE admin_id = ?').run(adminId)
    console.log(`[reset-local-admin] cleared sessions: ${cleared.changes}`)
  } catch (error) {
    console.warn('[reset-local-admin] sessions table clear skipped:', error.message)
  }

  const after = db.prepare(`
    SELECT id, username, substr(password_hash, 1, 48) AS hash_prefix, updated_at
    FROM administrators
    ORDER BY created_at ASC
  `).all()
  console.log('[reset-local-admin] after:', after)
  db.close()
  console.log(`[reset-local-admin] done — login with ${username} / ${password}`)
}

try {
  main()
} catch (error) {
  console.error('[reset-local-admin] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
}
