import Database from 'better-sqlite3'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  expectSqlToContainIndex,
  expectSqlToContainTable,
  readGeneratedMigrationSql
} from './migration-assertions'

describe('database migrations', () => {
  it('adds an optional custom excerpt without rewriting existing content', () => {
    const sql = readGeneratedMigrationSql()

    expect(sql).toContain('ALTER TABLE `post_content` ADD `custom_excerpt` text')
  })

  it('adds the administrator-selectable light theme with a safe existing-theme default', () => {
    const sql = readGeneratedMigrationSql()

    expect(sql).toContain("ALTER TABLE `site_settings` ADD `light_theme` text DEFAULT 'default' NOT NULL")
  })

  it('adds explicit opt-in automatic comment moderation without changing legacy defaults', () => {
    const sql = readGeneratedMigrationSql()

    expect(sql).toContain('ALTER TABLE `comment_settings` ADD `auto_moderation_enabled` integer DEFAULT false NOT NULL')
  })

  it('adds one bounded current analytics report snapshot column after retirement', () => {
    const sql = readGeneratedMigrationSql()

    expect(sql).toContain('ALTER TABLE `analytics_report_state` ADD `report_json` text')
  })

  it('adds a safe default weekday for configurable weekly analytics reports', () => {
    const sql = readGeneratedMigrationSql()

    expect(sql).toContain("ALTER TABLE `analytics_report_state` ADD `day_of_week` text DEFAULT 'mon' NOT NULL")
  })

  it('creates the required version one tables', () => {
    const sql = readGeneratedMigrationSql()

    for (const tableName of [
      'administrators',
      'sessions',
      'administrator_security',
      'administrator_recovery_codes',
      'administrator_ip_rules',
      'administrator_login_attempts',
      'categories',
      'tags',
      'posts',
      'post_content',
      'post_metadata',
      'post_tags',
      'comments',
      'media_references',
      'site_settings',
      'home_settings',
      'profile_settings',
      'search_settings',
      'analytics_settings',
      'analytics_events',
      'analytics_ingest_locks',
      'analytics_sessions',
      'analytics_visitors',
      'analytics_visitor_days',
      'analytics_daily_metrics',
      'analytics_page_daily',
      'analytics_referrer_daily',
      'analytics_dimension_daily',
      'analytics_search_daily',
      'analytics_conversion_daily',
      'comment_settings',
      'media_settings',
      'security_settings',
      'seo_settings',
      'integration_settings',
      'search_sync_jobs',
      'analytics_report_state'
    ]) {
      expectSqlToContainTable(sql, tableName)
    }
  })

  it('creates required lookup indexes for public and admin paths', () => {
    const sql = readGeneratedMigrationSql()

    for (const indexName of [
      'sessions_token_hash_unique',
      'sessions_expires_at_idx',
      'administrator_recovery_codes_hash_unique',
      'administrator_recovery_codes_admin_id_idx',
      'administrator_ip_rules_type_ip_unique',
      'administrator_login_attempts_created_at_idx',
      'administrator_login_attempts_ip_created_at_idx',
      'administrator_login_attempts_username_created_at_idx',
      'posts_slug_unique',
      'posts_status_idx',
      'posts_type_idx',
      'posts_published_at_idx',
      'posts_category_id_idx',
      'comments_post_id_idx',
      'comments_status_idx',
      'categories_slug_unique',
      'tags_slug_unique',
      'post_tags_post_id_idx',
      'post_tags_tag_id_idx',
      'integration_settings_capability_provider_unique',
      'analytics_events_expires_at_idx',
      'analytics_events_type_session_occurred_at_idx',
      'analytics_visitor_days_visitor_hash_day_idx',
      'analytics_sessions_expires_at_idx',
      'analytics_visitors_expires_at_idx',
      'search_sync_jobs_provider_post_unique',
      'search_sync_jobs_claim_idx',
      'search_sync_jobs_provider_status_idx'
    ]) {
      expectSqlToContainIndex(sql, indexName)
    }
  })

  it('keeps migration SQL, journal entries, and the latest schema snapshot aligned', () => {
    const migrationsDir = join(process.cwd(), 'server/database/migrations')
    const metaDir = join(migrationsDir, 'meta')
    const sqlTags = readdirSync(migrationsDir)
      .filter((file) => file.endsWith('.sql'))
      .sort()
      .map((file) => file.slice(0, -'.sql'.length))
    const journal = JSON.parse(readFileSync(join(metaDir, '_journal.json'), 'utf8')) as {
      entries: Array<{ idx: number; tag: string }>
    }

    expect(journal.entries.map((entry) => entry.tag)).toEqual(sqlTags)
    expect(journal.entries.map((entry) => entry.idx)).toEqual(sqlTags.map((_, index) => index))
    expect(existsSync(join(metaDir, `${sqlTags.at(-1)?.slice(0, 4)}_snapshot.json`))).toBe(true)
  })

  it('copies legacy analytics selection into the registry without deleting legacy data', () => {
    const sql = readGeneratedMigrationSql()
    expect(sql).toContain('INSERT OR IGNORE INTO `integration_settings`')
    expect(sql).toContain("WHEN 'cloudflare' THEN 'cloudflare-web-analytics'")
    expect(sql).toContain('FROM `analytics_settings`')
    expect(sql).toContain('NOT EXISTS')
  })

  it('executes the legacy analytics migration and preserves a preconfigured registry authority', () => {
    const migrationsDir = join(process.cwd(), 'server/database/migrations')
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
    const migrationName = '0011_analytics_runtime_authority.sql'
    const sqlite = new Database(':memory:')
    for (const file of files.filter((file) => file < migrationName)) {
      sqlite.exec(readFileSync(join(migrationsDir, file), 'utf8'))
    }
    sqlite.prepare(`INSERT INTO analytics_settings
      (id, enabled, provider_key, script_url, site_id, render_config_json)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run('analytics', 1, 'cloudflare', 'https://static.cloudflareinsights.com/beacon.min.js', 'token', '{}')

    const migration = readFileSync(join(migrationsDir, migrationName), 'utf8')
    sqlite.exec(migration)

    expect(sqlite.prepare(`SELECT capability, provider_key AS providerKey, enabled, status,
      public_config_json AS publicConfigJson FROM integration_settings`).get()).toMatchObject({
      capability: 'analytics', providerKey: 'cloudflare-web-analytics', enabled: 1, status: 'configured'
    })
    expect(sqlite.prepare('SELECT COUNT(*) AS count FROM analytics_settings').get()).toEqual({ count: 1 })

    sqlite.prepare(`UPDATE integration_settings SET provider_key = 'plausible', public_config_json = '{}'
      WHERE capability = 'analytics'`).run()
    sqlite.exec(migration)
    expect(sqlite.prepare(`SELECT COUNT(*) AS count FROM integration_settings
      WHERE capability = 'analytics'`).get()).toEqual({ count: 1 })
    expect(sqlite.prepare(`SELECT provider_key AS providerKey FROM integration_settings
      WHERE capability = 'analytics'`).get()).toEqual({ providerKey: 'plausible' })
  })

  it('retires legacy analytics tables and only obsolete analytics provider rows', () => {
    const migrationsDir = join(process.cwd(), 'server/database/migrations')
    const files = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
    const sqlite = new Database(':memory:')
    for (const file of files.filter((file) => file < '0027_breezy_betty_brant.sql')) {
      sqlite.exec(readFileSync(join(migrationsDir, file), 'utf8'))
    }

    sqlite.prepare(`INSERT INTO integration_settings
      (id, capability, provider_key, enabled, status, updated_at)
      VALUES (?, 'analytics', ?, 1, 'configured', ?)`)
      .run('obsolete-native', 'native', Date.now())
    sqlite.prepare(`INSERT INTO integration_settings
      (id, capability, provider_key, enabled, status, updated_at)
      VALUES (?, 'analytics', ?, 1, 'configured', ?)`)
      .run('retained-plausible', 'plausible', Date.now())
    sqlite.exec(`
      INSERT INTO administrators (id, username, password_hash)
        VALUES ('retained-admin', 'retained-admin', 'hash');
      INSERT INTO categories (id, name, slug)
        VALUES ('retained-category', 'Retained', 'retained');
      INSERT INTO posts (id, type, status, title, slug, author_id, category_id, published_at)
        VALUES ('retained-post', 'article', 'published', 'Retained post', 'retained-post',
          'retained-admin', 'retained-category', 1784390000000);
      INSERT INTO post_content (post_id, markdown, processing_state)
        VALUES ('retained-post', '# Retained', 'processed');
      INSERT INTO comments (id, post_id, nickname, content, status)
        VALUES ('retained-comment', 'retained-post', 'Reader', 'Retained comment', 'approved');
      INSERT INTO site_settings (id, site_name)
        VALUES ('retained-site', 'Retained site');
    `)

    sqlite.exec(readFileSync(join(migrationsDir, '0027_breezy_betty_brant.sql'), 'utf8'))

    const tables = new Set((sqlite.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as Array<{ name: string }>).map((row) => row.name))
    for (const table of [
      'analytics_settings', 'analytics_events', 'analytics_ingest_locks', 'analytics_sessions',
      'analytics_visitors', 'analytics_visitor_days', 'analytics_daily_metrics',
      'analytics_page_daily', 'analytics_referrer_daily', 'analytics_dimension_daily',
      'analytics_search_daily', 'analytics_conversion_daily', 'analytics_snapshot_state',
      'analytics_snapshot_daily_metrics', 'analytics_snapshot_page_daily',
      'analytics_snapshot_referrer_daily', 'analytics_snapshot_dimension_daily',
      'analytics_snapshot_search_daily', 'analytics_snapshot_article_projection',
      'analytics_snapshot_projection_manifest'
    ]) expect(tables.has(table)).toBe(false)

    expect(tables.has('analytics_report_state')).toBe(true)
    expect(sqlite.prepare(`SELECT provider_key AS providerKey FROM integration_settings`).all())
      .toEqual([{ providerKey: 'plausible' }])
    expect(sqlite.prepare(`SELECT username FROM administrators WHERE id = 'retained-admin'`).get())
      .toEqual({ username: 'retained-admin' })
    expect(sqlite.prepare(`SELECT slug FROM posts WHERE id = 'retained-post'`).get())
      .toEqual({ slug: 'retained-post' })
    expect(sqlite.prepare(`SELECT content FROM comments WHERE id = 'retained-comment'`).get())
      .toEqual({ content: 'Retained comment' })
    expect(sqlite.prepare(`SELECT site_name AS siteName FROM site_settings WHERE id = 'retained-site'`).get())
      .toEqual({ siteName: 'Retained site' })
    expect(sqlite.pragma('foreign_key_check')).toEqual([])
    expect(sqlite.pragma('integrity_check', { simple: true })).toBe('ok')
  })
})
