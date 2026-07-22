import { and, eq, gt, lt } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import { administrators, sessions } from '../database/schema'
import type {
  SessionRepository,
  SessionWithAdministrator
} from './contracts/auth-repositories'

export function createSessionRepository(db: AppDatabase): SessionRepository {
  return {
    async create(input) {
      const [row] = await db.insert(sessions).values(input).returning()
      return row
    },

    async findByTokenHash(tokenHash, now) {
      const rows = await db
        .select({
          id: sessions.id,
          adminId: sessions.adminId,
          tokenHash: sessions.tokenHash,
          expiresAt: sessions.expiresAt,
          createdAt: sessions.createdAt,
          administratorId: administrators.id,
          administratorUsername: administrators.username
        })
        .from(sessions)
        .innerJoin(administrators, eq(sessions.adminId, administrators.id))
        .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
        .limit(1)

      const session = rows[0]
      if (!session) {
        return null
      }

      return {
        id: session.id,
        adminId: session.adminId,
        tokenHash: session.tokenHash,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        administrator: {
          id: session.administratorId,
          username: session.administratorUsername
        }
      } satisfies SessionWithAdministrator
    },

    async deleteByTokenHash(tokenHash) {
      await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash))
    },

    async deleteExpired(now) {
      await db.delete(sessions).where(lt(sessions.expiresAt, now))
    }
  }
}
