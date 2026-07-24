import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, lt, ne, or, sql } from 'drizzle-orm'
import type { AppDatabase } from '../database/client'
import {
  administratorIpRules,
  administratorLoginAttempts,
  administratorRecoveryCodes,
  administratorSecurity,
  administrators,
  sessions
} from '../database/schema'
import type { AdminSecurityRepository } from './contracts/admin-security-repositories'

const D1_IP_RULE_INSERT_BATCH_SIZE = 20

export function createAdminSecurityRepository(db: AppDatabase): AdminSecurityRepository {
  async function executeBatch(statements: unknown[]): Promise<unknown[]> {
    const batch = (db as AppDatabase & { batch?: (values: unknown[]) => Promise<unknown[]> }).batch
    if (typeof batch === 'function') {
      return batch.call(db, statements)
    }
    // The Better SQLite test adapter has no D1 batch API. Production D1 always uses the atomic
    // branch above; sequential execution exists only so repository behavior can be exercised locally.
    const results: unknown[] = []
    for (const statement of statements) results.push(await statement)
    return results
  }

  return {
    async getTwoFactor(adminId) {
      const row = await db.query.administratorSecurity.findFirst({
        where: eq(administratorSecurity.adminId, adminId)
      })
      if (!row) return null
      return {
        adminId: row.adminId,
        secretCiphertext: row.twoFactorSecretCiphertext,
        secretIv: row.twoFactorSecretIv,
        enabledAt: row.twoFactorEnabledAt
      }
    },

    async savePendingTwoFactor(input) {
      // Refuse to overwrite an already-enabled factor: setWhere skips the conflict update, and
      // recovery-code cleanup only runs when this write actually landed as pending.
      const [written] = await executeBatch([
        db.insert(administratorSecurity).values({
          adminId: input.adminId,
          twoFactorSecretCiphertext: input.secretCiphertext,
          twoFactorSecretIv: input.secretIv,
          twoFactorEnabledAt: null,
          createdAt: input.now,
          updatedAt: input.now
        }).onConflictDoUpdate({
          target: administratorSecurity.adminId,
          set: {
            twoFactorSecretCiphertext: input.secretCiphertext,
            twoFactorSecretIv: input.secretIv,
            twoFactorEnabledAt: null,
            updatedAt: input.now
          },
          setWhere: isNull(administratorSecurity.twoFactorEnabledAt)
        }).returning({ adminId: administratorSecurity.adminId }),
        db.delete(administratorRecoveryCodes).where(and(
          eq(administratorRecoveryCodes.adminId, input.adminId),
          sql`exists (
            select 1 from administrator_security
            where admin_id = ${input.adminId}
              and two_factor_enabled_at is null
              and two_factor_secret_ciphertext = ${input.secretCiphertext}
              and updated_at = ${input.now.getTime()}
          )`
        ))
      ])
      return Array.isArray(written) && written.length > 0
    },

    async enableTwoFactor(input) {
      const enabledNow = sql`exists (
        select 1 from administrator_security
        where admin_id = ${input.adminId}
          and two_factor_enabled_at = ${input.enabledAt.getTime()}
      )`
      const [enabled] = await executeBatch([
        db.update(administratorSecurity).set({
          twoFactorEnabledAt: input.enabledAt,
          updatedAt: input.enabledAt
        }).where(and(
          eq(administratorSecurity.adminId, input.adminId),
          isNull(administratorSecurity.twoFactorEnabledAt),
          isNotNull(administratorSecurity.twoFactorSecretCiphertext)
        )).returning({ adminId: administratorSecurity.adminId }),
        db.delete(administratorRecoveryCodes).where(and(
          eq(administratorRecoveryCodes.adminId, input.adminId),
          enabledNow
        )),
        ...input.recoveryCodes.map((code) => db.insert(administratorRecoveryCodes).select(
          db.select({
            id: sql<string>`${code.id}`.as('id'),
            adminId: sql<string>`${input.adminId}`.as('admin_id'),
            codeHash: sql<string>`${code.codeHash}`.as('code_hash'),
            createdAt: sql<number>`${input.enabledAt.getTime()}`.as('created_at')
          }).from(sql`(select 1)`).where(enabledNow)
        ))
      ])
      return Array.isArray(enabled) && enabled.length > 0
    },

    async disableTwoFactor(adminId, now) {
      await executeBatch([
        db.update(administratorSecurity).set({
          twoFactorSecretCiphertext: null,
          twoFactorSecretIv: null,
          twoFactorEnabledAt: null,
          updatedAt: now
        }).where(eq(administratorSecurity.adminId, adminId)),
        db.delete(administratorRecoveryCodes).where(eq(administratorRecoveryCodes.adminId, adminId))
      ])
    },

    async consumeRecoveryCodeAndDisableTwoFactor(input) {
      const [, consumed] = await executeBatch([
        db.update(administratorSecurity).set({
          twoFactorSecretCiphertext: null,
          twoFactorSecretIv: null,
          twoFactorEnabledAt: null,
          updatedAt: input.now
        }).where(and(
          eq(administratorSecurity.adminId, input.adminId),
          isNotNull(administratorSecurity.twoFactorEnabledAt),
          sql`exists (
            select 1 from administrator_recovery_codes
            where admin_id = ${input.adminId} and code_hash = ${input.codeHash}
          )`
        )),
        db.delete(administratorRecoveryCodes)
          .where(and(
            eq(administratorRecoveryCodes.adminId, input.adminId),
            sql`exists (
              select 1 from administrator_recovery_codes
              where admin_id = ${input.adminId} and code_hash = ${input.codeHash}
            )`,
            sql`exists (
              select 1 from administrator_security
              where admin_id = ${input.adminId}
                and two_factor_enabled_at is null
                and two_factor_secret_ciphertext is null
                and updated_at = ${input.now.getTime()}
            )`
          ))
          .returning({ id: administratorRecoveryCodes.id })
      ])
      return Array.isArray(consumed) && consumed.length > 0
    },

    async updateCredentialsAndDeleteOtherSessions(input) {
      const fields: Partial<typeof administrators.$inferInsert> = {
        passwordHash: input.passwordHash,
        updatedAt: input.updatedAt
      }
      if (input.username !== undefined) fields.username = input.username
      await executeBatch([
        db.update(administrators).set(fields).where(eq(administrators.id, input.adminId)),
        db.delete(sessions).where(and(
          eq(sessions.adminId, input.adminId),
          ne(sessions.tokenHash, input.currentTokenHash)
        ))
      ])
    },

    async listIpRules() {
      return db.select({
        id: administratorIpRules.id,
        type: administratorIpRules.type,
        ipAddress: administratorIpRules.ipAddress,
        createdAt: administratorIpRules.createdAt
      }).from(administratorIpRules).orderBy(asc(administratorIpRules.type), asc(administratorIpRules.ipAddress))
    },

    async replaceIpRules(input) {
      const removeExisting = db.delete(administratorIpRules)
      if (input.rules.length === 0) {
        await removeExisting
        return
      }
      const statements: unknown[] = [removeExisting]
      for (let offset = 0; offset < input.rules.length; offset += D1_IP_RULE_INSERT_BATCH_SIZE) {
        statements.push(db.insert(administratorIpRules).values(
          input.rules.slice(offset, offset + D1_IP_RULE_INSERT_BATCH_SIZE).map((rule) => ({
            ...rule,
            createdByAdminId: input.adminId,
            createdAt: input.now
          }))
        ))
      }
      await executeBatch(statements)
    },

    async recordLoginAttempt(input) {
      await db.insert(administratorLoginAttempts).values(input)
    },

    async reserveLoginAttempt(input) {
      const credentialFailureReasons = ['invalid_credentials', 'invalid_two_factor'] as const
      const ipFailureReasons = [...credentialFailureReasons, 'ip_denied'] as const
      const cutoff = input.cutoff.getTime()
      const attempt = input.attempt
      const availableSlot = (
        field: typeof administratorLoginAttempts.ipAddress | typeof administratorLoginAttempts.username,
        value: string,
        eligibleReasons: readonly string[]
      ) => sql`
        (
          select count(*) from ${administratorLoginAttempts}
          where ${field} = ${value}
            and ${administratorLoginAttempts.successful} = 0
            and (
              ${administratorLoginAttempts.failureReason} is null
              or ${administratorLoginAttempts.failureReason} in (${sql.join(eligibleReasons.map((reason) => sql`${reason}`), sql`, `)})
            )
            and ${administratorLoginAttempts.createdAt} >= ${cutoff}
        ) < ${input.maximumFailures}
      `
      const reservation = db.select({
        id: sql<string>`${attempt.id}`.as('id'),
        adminId: sql<null>`null`.as('admin_id'),
        username: sql<string>`${attempt.username}`.as('username'),
        ipAddress: sql<string>`${attempt.ipAddress}`.as('ip_address'),
        successful: sql<number>`0`.as('successful'),
        failureReason: sql<null>`null`.as('failure_reason'),
        createdAt: sql<number>`${attempt.createdAt.getTime()}`.as('created_at')
      }).from(sql`(select 1)`).where(and(
        availableSlot(administratorLoginAttempts.ipAddress, attempt.ipAddress, ipFailureReasons),
        availableSlot(administratorLoginAttempts.username, attempt.username, credentialFailureReasons)
      ))
      const created = await db.insert(administratorLoginAttempts)
        .select(reservation)
        .returning({ id: administratorLoginAttempts.id })
      return created.some((row) => row.id === attempt.id)
    },

    async completeLoginAttempt(input) {
      const completed = await db.update(administratorLoginAttempts).set({
        adminId: input.adminId,
        username: input.username,
        successful: false,
        failureReason: input.failureReason
      }).where(and(
        eq(administratorLoginAttempts.id, input.id),
        eq(administratorLoginAttempts.successful, false),
        sql`${administratorLoginAttempts.failureReason} is null`
      )).returning({ id: administratorLoginAttempts.id })
      return completed.some((row) => row.id === input.id)
    },

    async getRecentLoginFailures(input) {
      const credentialFailureReasons = ['invalid_credentials', 'invalid_two_factor'] as const
      const ipFailureReasons = [...credentialFailureReasons, 'ip_denied'] as const
      const recentFailures = (
        field: typeof administratorLoginAttempts.ipAddress | typeof administratorLoginAttempts.username,
        value: string,
        eligibleReasons: readonly ('invalid_credentials' | 'invalid_two_factor' | 'ip_denied')[]
      ) => (
        db.select({ createdAt: administratorLoginAttempts.createdAt })
          .from(administratorLoginAttempts)
          .where(and(
            eq(field, value),
            eq(administratorLoginAttempts.successful, false),
            or(
              sql`${administratorLoginAttempts.failureReason} is null`,
              inArray(administratorLoginAttempts.failureReason, eligibleReasons)
            ),
            gte(administratorLoginAttempts.createdAt, input.cutoff)
          ))
          .orderBy(desc(administratorLoginAttempts.createdAt))
          .limit(input.limit)
      )
      const [ipAddress, username] = await Promise.all([
        recentFailures(administratorLoginAttempts.ipAddress, input.ipAddress, ipFailureReasons),
        recentFailures(administratorLoginAttempts.username, input.username, credentialFailureReasons)
      ])
      return {
        ipAddress: ipAddress.map((row) => row.createdAt),
        username: username.map((row) => row.createdAt)
      }
    },

    async createSessionAndCompleteLoginAttempt(input) {
      const eligibleSession = db.select({
        id: sql<string>`${input.session.id}`.as('id'),
        adminId: sql<string>`${input.session.adminId}`.as('admin_id'),
        tokenHash: sql<string>`${input.session.tokenHash}`.as('token_hash'),
        expiresAt: sql<number>`${input.session.expiresAt.getTime()}`.as('expires_at'),
        createdAt: sql<number>`${input.session.createdAt.getTime()}`.as('created_at')
      }).from(administratorLoginAttempts).where(and(
        eq(administratorLoginAttempts.id, input.attemptId),
        eq(administratorLoginAttempts.successful, false),
        sql`${administratorLoginAttempts.failureReason} is null`
      )).limit(1)
      const [created] = await executeBatch([
        db.insert(sessions).select(eligibleSession).returning({ id: sessions.id }),
        db.update(administratorLoginAttempts).set({
          adminId: input.adminId,
          username: input.username,
          successful: true,
          failureReason: null
        }).where(and(
          eq(administratorLoginAttempts.id, input.attemptId),
          sql`exists (select 1 from ${sessions} where ${sessions.id} = ${input.session.id})`
        ))
      ])
      return Array.isArray(created) && created.some((row) => (
        typeof row === 'object' && row !== null && 'id' in row && row.id === input.session.id
      ))
    },

    async consumeRecoveryCodeAndCreateSessionAndCompleteLoginAttempt(input) {
      const eligibleSession = db.select({
        id: sql<string>`${input.session.id}`.as('id'),
        adminId: sql<string>`${input.session.adminId}`.as('admin_id'),
        tokenHash: sql<string>`${input.session.tokenHash}`.as('token_hash'),
        expiresAt: sql<number>`${input.session.expiresAt.getTime()}`.as('expires_at'),
        createdAt: sql<number>`${input.session.createdAt.getTime()}`.as('created_at')
      }).from(administratorRecoveryCodes).where(and(
        eq(administratorRecoveryCodes.adminId, input.adminId),
        eq(administratorRecoveryCodes.codeHash, input.codeHash),
        sql`exists (
          select 1 from ${administratorLoginAttempts}
          where ${administratorLoginAttempts.id} = ${input.attemptId}
            and ${administratorLoginAttempts.successful} = 0
            and ${administratorLoginAttempts.failureReason} is null
        )`
      )).limit(1)

      const [created] = await executeBatch([
        db.insert(sessions).select(eligibleSession).returning({ id: sessions.id }),
        db.update(administratorLoginAttempts).set({
          adminId: input.adminId,
          username: input.username,
          successful: true,
          failureReason: null
        }).where(and(
          eq(administratorLoginAttempts.id, input.attemptId),
          sql`exists (select 1 from ${sessions} where ${sessions.id} = ${input.session.id})`
        )),
        db.delete(administratorRecoveryCodes).where(and(
          eq(administratorRecoveryCodes.adminId, input.adminId),
          eq(administratorRecoveryCodes.codeHash, input.codeHash),
          sql`exists (select 1 from ${sessions} where ${sessions.id} = ${input.session.id})`
        ))
      ])
      return Array.isArray(created) && created.some((row) => (
        typeof row === 'object' && row !== null && 'id' in row && row.id === input.session.id
      ))
    },

    async listLoginAttempts(input) {
      const [items, totals] = await Promise.all([
        db.select({
          id: administratorLoginAttempts.id,
          adminId: administratorLoginAttempts.adminId,
          username: administratorLoginAttempts.username,
          ipAddress: administratorLoginAttempts.ipAddress,
          successful: administratorLoginAttempts.successful,
          failureReason: administratorLoginAttempts.failureReason,
          createdAt: administratorLoginAttempts.createdAt
        }).from(administratorLoginAttempts)
          .where(gte(administratorLoginAttempts.createdAt, input.cutoff))
          .orderBy(desc(administratorLoginAttempts.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: count() }).from(administratorLoginAttempts)
          .where(gte(administratorLoginAttempts.createdAt, input.cutoff))
      ])
      return { items, total: Number(totals[0]?.count ?? 0) }
    },

    async deleteLoginAttemptsBefore(cutoff, limit) {
      await db.run(sql`
        delete from administrator_login_attempts
        where id in (
          select id from administrator_login_attempts
          where created_at < ${cutoff.getTime()}
          order by created_at asc
          limit ${limit}
        )
      `)
    }
  }
}
