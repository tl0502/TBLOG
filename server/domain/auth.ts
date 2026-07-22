export interface NewAdministratorRecord {
  id: string
  username: string
  passwordHash: string
  createdAt?: Date
  updatedAt?: Date
}

export interface AdministratorSessionRecord {
  id: string
  adminId: string
  tokenHash: string
  expiresAt: Date
  createdAt: Date
}

export interface NewAdministratorSessionRecord {
  id: string
  adminId: string
  tokenHash: string
  expiresAt: Date
  createdAt?: Date
}
