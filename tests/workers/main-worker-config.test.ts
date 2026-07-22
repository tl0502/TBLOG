import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const source = (path: string) => readFileSync(join(root, path), 'utf8')

describe('main Cloudflare Worker configuration', () => {
  it('declares the auto-provisioned production database and scheduled tasks', () => {
    const config = JSON.parse(source('wrangler.jsonc')) as {
      name: string
      main: string
      keep_vars: boolean
      assets: { directory: string }
      d1_databases?: Array<Record<string, unknown>>
      kv_namespaces?: Array<Record<string, unknown>>
      secrets?: { required: string[] }
      triggers: { crons: string[] }
    }

    expect(config.name).toBe('tblog')
    expect(config.main).toBe('.output/server/index.mjs')
    expect(config.assets.directory).toBe('.output/public')
    expect(config.keep_vars).toBe(true)
    expect(config.d1_databases).toEqual([
      {
        binding: 'DB',
        database_name: 'tblog-production-db',
        migrations_dir: 'server/database/migrations'
      }
    ])
    expect(config.kv_namespaces).toBeUndefined()
    expect(config.secrets).toBeUndefined()
    expect(config.triggers.crons).toEqual(['*/5 * * * *', '2-59/5 * * * *'])
    expect(source('wrangler.jsonc')).not.toMatch(/database_id|account_id/)
  })

  it('keeps local D1 development separate from Git deployment', () => {
    const deployConfig = JSON.parse(source('wrangler.jsonc')) as {
      d1_databases: Array<Record<string, unknown>>
    } & Record<string, unknown>
    const localConfig = JSON.parse(source('wrangler.local.jsonc')) as {
      d1_databases: Array<Record<string, unknown>>
      secrets: { required: string[] }
    } & Record<string, unknown>
    const packageJson = JSON.parse(source('package.json')) as { scripts: Record<string, string> }
    const { d1_databases, secrets, kv_namespaces, ...sharedLocalConfig } = localConfig
    const { d1_databases: deployDatabases, ...sharedDeployConfig } = deployConfig

    expect(sharedLocalConfig).toEqual(sharedDeployConfig)
    expect(kv_namespaces).toEqual([
      {
        binding: 'CACHE_KV',
        id: '00000000000000000000000000000000'
      }
    ])
    expect(deployDatabases).toEqual([
      {
        binding: 'DB',
        database_name: 'tblog-production-db',
        migrations_dir: 'server/database/migrations'
      }
    ])
    expect(d1_databases).toEqual([
      { binding: 'DB', migrations_dir: 'server/database/migrations' }
    ])
    expect(secrets.required).toContain('SESSION_SECRET')
    expect(packageJson.scripts.preview).toContain('wrangler dev --config wrangler.local.jsonc')
    expect(packageJson.scripts.deploy).toBe('wrangler deploy')
    expect(packageJson.scripts['drizzle:migrate:local']).toContain('--config wrangler.local.jsonc')
    expect(source('nuxt.config.ts')).toContain("preset: 'cloudflare_module'")
    expect(source('scripts/cloudflare-types.mjs')).toContain("'wrangler.local.jsonc'")
  })

  it('keeps search and analytics scheduled tasks in separate invocations', () => {
    const nuxtConfig = source('nuxt.config.ts')
    expect(nuxtConfig).toContain("'*/5 * * * *': ['search:sync']")
    expect(nuxtConfig).toContain("'2-59/5 * * * *': ['analytics:report-sync']")
  })
})
