import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const scriptPath = resolve(projectRoot, 'scripts/smoke-local.mjs')

function runWithEnvironment(overrides: Record<string, string | undefined>) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key]
    }
  }

  return spawnSync(process.execPath, [scriptPath], {
    cwd: projectRoot,
    env,
    encoding: 'utf8',
    timeout: 5_000
  })
}

describe('smoke-local configuration guard', () => {
  it('rejects a non-loopback target without credentials before making a request', () => {
    const result = runWithEnvironment({
      BASE_URL: 'https://example.com',
      SMOKE_ADMIN_USER: undefined,
      SMOKE_ADMIN_PASS: undefined
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('[FAIL] step 0: configuration')
    expect(result.stdout).toContain('require explicit SMOKE_ADMIN_USER and SMOKE_ADMIN_PASS')
    expect(result.stdout).not.toContain('setup status')
  })

  it('rejects the local default credentials on a non-loopback target', () => {
    const result = runWithEnvironment({
      BASE_URL: 'https://example.com',
      SMOKE_ADMIN_USER: 'smoke_admin',
      SMOKE_ADMIN_PASS: 'smoke-admin-secret-2026'
    })

    expect(result.status).toBe(1)
    expect(result.stdout).toContain('cannot use the local smoke default credentials')
    expect(result.stdout).not.toContain('setup status')
  })
})
