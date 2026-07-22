import { eq, sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { administrators } from '../database/schema'
import type {
  AdministratorRepository,
  AdministratorWithPassword,
  PublicAdministrator
} from './contracts/auth-repositories'

function toPublicAdministrator(row: typeof administrators.$inferSelect): PublicAdministrator {
  return {
    id: row.id,
    username: row.username
  }
}

export function createAdministratorRepository(db: AppDatabase): AdministratorRepository {
  return {
    async hasAnyAdministrator() {
      const rows = await db.select({ count: sql<number>`count(*)` }).from(administrators).limit(1)
      return Number(rows[0]?.count ?? 0) > 0
    },

    async findById(id) {
      const row = await db.query.administrators.findFirst({
        where: eq(administrators.id, id)
      })

      return row ? toPublicAdministrator(row) : null
    },

    async findByIdWithPassword(id) {
      const row = await db.query.administrators.findFirst({
        where: eq(administrators.id, id)
      })
      return row ? {
        id: row.id,
        username: row.username,
        passwordHash: row.passwordHash
      } : null
    },

    async findByUsername(username) {
      const row = await db.query.administrators.findFirst({
        where: eq(administrators.username, username)
      })

      if (!row) {
        return null
      }

      return {
        id: row.id,
        username: row.username,
        passwordHash: row.passwordHash
      } satisfies AdministratorWithPassword
    },

    async create(input) {
      const [row] = await db.insert(administrators).values(input).returning()
      return toPublicAdministrator(row)
    },

    async createFirst(input) {
      // D1 has no interactive transactions, so the "only one administrator" guard
      // runs atomically inside a single statement: the INSERT executes only while the
      // table is still empty. SQLite holds a write lock for the whole statement, so
      // concurrent setup attempts serialize and at most one row is ever created.
      const createdAt = (input.createdAt ?? new Date()).getTime()
      const updatedAt = (input.updatedAt ?? new Date()).getTime()

      const rows = await db.all<{ id: string; username: string }>(sql`
        insert into administrators (id, username, password_hash, created_at, updated_at)
        select ${input.id}, ${input.username}, ${input.passwordHash}, ${createdAt}, ${updatedAt}
        where not exists (select 1 from administrators)
        returning id, username
      `)

      const row = rows[0]
      return row ? { id: row.id, username: row.username } : null
    },

    async updateCredentials(input) {
      const fields: Partial<typeof administrators.$inferInsert> = { updatedAt: input.updatedAt }
      if (input.username !== undefined) fields.username = input.username
      if (input.passwordHash !== undefined) fields.passwordHash = input.passwordHash
      const [row] = await db.update(administrators)
        .set(fields)
        .where(eq(administrators.id, input.id))
        .returning()
      return toPublicAdministrator(row)
    }
  }
}
