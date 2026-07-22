import { createDatabaseClient, getDatabaseClient } from '../../../server/database/client'

describe('database client', () => {
  it('throws a clear error when the DB binding is missing', () => {
    const event = {
      context: {
        cloudflare: {
          env: {}
        }
      }
    }

    expect(() => getDatabaseClient(event as never)).toThrow('D1 binding DB is not available')
  })

  it('creates a Drizzle D1 client when a binding is provided', () => {
    const binding = {} as D1Database

    expect(createDatabaseClient(binding)).toBeDefined()
  })
})
