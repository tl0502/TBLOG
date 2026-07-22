import type {
  AdministratorSessionRecord,
  NewAdministratorRecord,
  NewAdministratorSessionRecord
} from '../../domain/auth'

export interface PublicAdministrator {
  id: string
  username: string
}

export interface AdministratorWithPassword extends PublicAdministrator {
  passwordHash: string
}

export interface SessionWithAdministrator extends AdministratorSessionRecord {
  administrator: PublicAdministrator
}

export interface AdministratorRepository {
  hasAnyAdministrator(): Promise<boolean>
  findById(id: string): Promise<PublicAdministrator | null>
  findByIdWithPassword(id: string): Promise<AdministratorWithPassword | null>
  findByUsername(username: string): Promise<AdministratorWithPassword | null>
  create(input: NewAdministratorRecord): Promise<PublicAdministrator>
  createFirst(input: NewAdministratorRecord): Promise<PublicAdministrator | null>
  updateCredentials(input: {
    id: string
    username?: string
    passwordHash?: string
    updatedAt: Date
  }): Promise<PublicAdministrator>
}

export interface SessionRepository {
  create(input: NewAdministratorSessionRecord): Promise<AdministratorSessionRecord>
  findByTokenHash(tokenHash: string, now: Date): Promise<SessionWithAdministrator | null>
  deleteByTokenHash(tokenHash: string): Promise<void>
  deleteExpired(now: Date): Promise<void>
}
