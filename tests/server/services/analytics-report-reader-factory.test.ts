import { describe, expect, it, vi } from 'vitest'
import { getDatabaseClient } from '../../../server/database/client'
import { createAnalyticsReportStateRepository } from '../../../server/repositories/analytics-report-state-repository'
import { createPostReadRepository } from '../../../server/repositories/post-read-repository'
import { createAnalyticsReportReader } from '../../../server/services/analytics-report-service'

vi.mock('../../../server/database/client', () => ({ getDatabaseClient: vi.fn() }))
vi.mock('../../../server/repositories/analytics-report-state-repository', () => ({
  createAnalyticsReportStateRepository: vi.fn()
}))
vi.mock('../../../server/repositories/post-read-repository', () => ({ createPostReadRepository: vi.fn() }))
vi.mock('../../../server/services/analytics-report-service', () => ({ createAnalyticsReportReader: vi.fn() }))

import { createAnalyticsReportReaderForEvent } from '../../../server/services/analytics-report-reader-factory'

describe('analytics report reader factory', () => {
  it('constructs the public reader without enumerating runtime secrets or integration settings', () => {
    const db = { kind: 'db' }
    const stateRepository = { kind: 'state' }
    const articleRepository = { kind: 'articles' }
    const reader = { getCurrentReport: vi.fn() }
    const runtimeEnv = new Proxy({}, {
      ownKeys() {
        throw new Error('public analytics reader must not enumerate runtime env')
      }
    })
    const event = { context: { cloudflare: { env: runtimeEnv } } }

    vi.mocked(getDatabaseClient).mockReturnValue(db as never)
    vi.mocked(createAnalyticsReportStateRepository).mockReturnValue(stateRepository as never)
    vi.mocked(createPostReadRepository).mockReturnValue(articleRepository as never)
    vi.mocked(createAnalyticsReportReader).mockReturnValue(reader as never)

    expect(createAnalyticsReportReaderForEvent(event as never)).toBe(reader)
    expect(createAnalyticsReportReader).toHaveBeenCalledWith({ stateRepository, articleRepository })
  })
})
