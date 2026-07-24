import { describe, expect, it, vi } from 'vitest'
import {
  EMPTY_ANALYTICS_REPORT_STATE,
  publishedAnalyticsReportSchema,
  type AnalyticsReportState,
  type PublishedAnalyticsReport
} from '../../../server/domain/analytics-report'
import { createAnalyticsReportService } from '../../../server/services/analytics-report-service'

function setup(overrides: {
  state?: Partial<AnalyticsReportState>
  sourceFailure?: boolean
  providerConfigured?: boolean
} = {}) {
  let state: AnalyticsReportState = {
    ...EMPTY_ANALYTICS_REPORT_STATE,
    enabled: true,
    schedule: 'daily',
    timeOfDay: '03:00',
    timezone: 'UTC',
    dayOfWeek: 'mon',
    ...overrides.state
  }
  let snapshot: PublishedAnalyticsReport | null = null
  let runId: string | null = null
  let activationFailure = false
  let renewalFailure = false
  const stateRepository = {
    getState: vi.fn(async () => state),
    getCurrentReport: vi.fn(async () => snapshot),
    updateSettings: vi.fn(async (input) => (state = { ...state, ...input })),
    tryStartRun: vi.fn(async (id: string, now: Date) => {
      runId = id
      state = { ...state, lastAttemptAt: now }
      return true
    }),
    renewRun: vi.fn(async (id: string) => !renewalFailure && runId === id),
    markSuccess: vi.fn(async (input) => {
      if (activationFailure || runId !== input.runId) return false
      snapshot = publishedAnalyticsReportSchema.parse(JSON.parse(input.reportJson))
      state = {
        ...state,
        activeProvider: input.providerKey,
        configFingerprint: input.configFingerprint,
        activeRevision: input.revision,
        sourceGeneratedAt: input.sourceGeneratedAt,
        publishedAt: input.publishedAt,
        syncedThrough: input.syncedThrough,
        lastSuccessAt: input.completedAt,
        lastFailureAt: null,
        lastError: null
      }
      runId = null
      return true
    }),
    markFailure: vi.fn(async (id: string, now: Date, message: string) => {
      if (runId !== id) return false
      state = { ...state, lastFailureAt: now, lastError: message }
      runId = null
      return true
    })
  }
  const provider = {
    providerKey: 'http-analytics-report',
    fetchReport: overrides.sourceFailure
      ? vi.fn().mockRejectedValue(new Error('provider down'))
      : vi.fn().mockResolvedValue({
          schemaVersion: 1,
          revision: 'rev-1',
          generatedAt: '2026-07-19T00:00:00.000Z',
          syncedThrough: '2026-07-18',
          articles: [{ path: '/posts/a', pageViews: 12 }, { path: '/posts/removed', pageViews: 99 }],
          currentHotspots: [{ path: '/posts/a', pageViews: 12, previousPageViews: 4 }],
          historicalHotspots: [{ path: '/posts/b', pageViews: 40 }]
        })
  }
  const integration = {
    capability: 'analyticsReport', providerKey: 'http-analytics-report', enabled: true,
    publicConfigJson: '{"endpoint":"https://analytics.example.com/report"}', status: 'active',
    lastCheckedAt: null, lastError: null, updatedAt: new Date('2026-07-19T00:00:00.000Z')
  }
  const integrationRepository = {
    list: vi.fn().mockResolvedValue(overrides.providerConfigured === false ? [] : [integration]),
    findByCapabilityAndProvider: vi.fn(), upsert: vi.fn(), upsertExclusive: vi.fn(), touch: vi.fn()
  }
  const articleRepository = {
    listAllPublishedAnalyticsArticles: vi.fn().mockResolvedValue([
      { id: 'a', slug: 'a', publishedAt: new Date('2026-07-10T00:00:00.000Z') },
      { id: 'b', slug: 'b', publishedAt: new Date('2026-07-09T00:00:00.000Z') }
    ]),
    listPublishedArticleIds: vi.fn().mockResolvedValue(['a', 'b'])
  }
  const createProvider = vi.fn().mockReturnValue(provider)
  const dependencies = {
    stateRepository,
    integrationRepository,
    articleRepository,
    createProvider
  }
  return {
    service: createAnalyticsReportService(dependencies),
    createFreshService: () => createAnalyticsReportService(dependencies),
    provider,
    stateRepository,
    integrationRepository,
    articleRepository,
    createProvider,
    getSnapshot: () => snapshot,
    setActivationFailure(value: boolean) { activationFailure = value },
    setRenewalFailure(value: boolean) { renewalFailure = value }
  }
}

describe('analytics report service', () => {
  it('normalizes and atomically activates one complete D1 snapshot', async () => {
    const { service, getSnapshot, stateRepository } = setup()
    const result = await service.sync(['maintenance:*'])
    const snapshot = getSnapshot()

    expect('report' in result).toBe(false)
    expect(result.activeRevision).toMatch(/^[a-f0-9]{64}$/)
    expect(snapshot?.articles.map((row) => [row.postId, row.pageViews])).toEqual([['a', 12], ['b', 0]])
    expect(snapshot?.currentHotspots).toEqual([{ postId: 'a', pageViews: 12, previousPageViews: 4 }])
    expect(snapshot?.historicalHotspots).toEqual([{ postId: 'b', pageViews: 40 }])
    expect(snapshot?.publishedArticlePageViews).toBe(12)
    expect(snapshot?.sourceRevision).toBe('rev-1')
    expect(snapshot?.revision).toBe(result.activeRevision)
    expect(stateRepository.markSuccess).toHaveBeenCalledWith(expect.objectContaining({
      integrationUpdatedAt: new Date('2026-07-19T00:00:00.000Z'),
      reportJson: expect.any(String)
    }))
  })

  it('preserves the last snapshot and records a retryable failure when a later fetch fails', async () => {
    const setupValue = setup()
    await setupValue.service.sync(['maintenance:*'])
    const previous = setupValue.getSnapshot()
    vi.mocked(setupValue.provider.fetchReport).mockRejectedValueOnce(new Error('provider down'))

    await expect(setupValue.service.sync(['maintenance:*'])).rejects.toMatchObject({ code: 'analytics_report_sync_failed' })
    expect(setupValue.getSnapshot()).toEqual(previous)
    expect(setupValue.stateRepository.markFailure).toHaveBeenCalledOnce()
  })

  it('does not replace the current snapshot when final conditional activation fails', async () => {
    const setupValue = setup()
    await setupValue.service.sync(['maintenance:*'])
    const previous = setupValue.getSnapshot()
    setupValue.setActivationFailure(true)
    vi.mocked(setupValue.provider.fetchReport).mockResolvedValueOnce({
      ...(await vi.mocked(setupValue.provider.fetchReport).mock.results[0]!.value),
      revision: 'rev-2'
    } as never)

    await expect(setupValue.service.sync(['maintenance:*'])).rejects.toMatchObject({ code: 'analytics_report_lease_expired' })
    expect(setupValue.getSnapshot()).toEqual(previous)
    await expect(setupValue.createFreshService().getCurrentReport()).resolves.toMatchObject({ sourceRevision: 'rev-1' })
  })

  it('renews the lease before activation and does not create a snapshot after lease loss', async () => {
    const setupValue = setup()
    setupValue.setRenewalFailure(true)

    await expect(setupValue.service.sync(['maintenance:*'])).rejects.toMatchObject({ code: 'analytics_report_lease_expired' })
    expect(setupValue.stateRepository.renewRun).toHaveBeenCalledOnce()
    expect(setupValue.getSnapshot()).toBeNull()
    expect(setupValue.stateRepository.markSuccess).not.toHaveBeenCalled()
  })

  it('publishes a new content revision when the provider revision is reused with different content', async () => {
    const setupValue = setup()
    await setupValue.service.sync(['maintenance:*'])
    const first = setupValue.getSnapshot()
    vi.mocked(setupValue.provider.fetchReport).mockResolvedValueOnce({
      schemaVersion: 1,
      revision: 'rev-1',
      generatedAt: '2026-07-19T00:00:00.000Z',
      syncedThrough: '2026-07-18',
      articles: [{ path: '/posts/a', pageViews: 999 }],
      currentHotspots: [{ path: '/posts/a', pageViews: 999, previousPageViews: 4 }],
      historicalHotspots: [{ path: '/posts/b', pageViews: 40 }]
    })

    await setupValue.service.sync(['maintenance:*'])
    const second = setupValue.getSnapshot()
    expect(second?.revision).not.toBe(first?.revision)
    expect(second?.articles.find((row) => row.postId === 'a')?.pageViews).toBe(999)
  })

  it('keeps the original publication timestamp when normalized content is unchanged', async () => {
    const setupValue = setup()
    await setupValue.service.sync(['maintenance:*'])
    const first = setupValue.getSnapshot()
    await setupValue.service.sync(['maintenance:*'])
    const second = setupValue.getSnapshot()
    expect(second?.revision).toBe(first?.revision)
    expect(second?.publishedAt).toBe(first?.publishedAt)
  })

  it('records the actual failure time instead of the synchronization start time', async () => {
    vi.useFakeTimers()
    try {
      const setupValue = setup()
      const startedAt = new Date('2026-07-19T00:00:00.000Z')
      const failedAt = new Date('2026-07-19T00:05:00.000Z')
      vi.setSystemTime(startedAt)
      vi.mocked(setupValue.provider.fetchReport).mockImplementationOnce(async () => {
        vi.setSystemTime(failedAt)
        throw new Error('provider down')
      })

      await expect(setupValue.service.sync(['maintenance:*'], startedAt))
        .rejects.toMatchObject({ code: 'analytics_report_sync_failed' })
      expect(setupValue.stateRepository.markFailure).toHaveBeenCalledWith(
        expect.any(String),
        failedAt,
        'Analytics report synchronization failed'
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it('reconciles a D1 snapshot once per request without reading integration settings or provider secrets', async () => {
    const setupValue = setup()
    await setupValue.service.sync(['maintenance:*'])
    setupValue.articleRepository.listPublishedArticleIds.mockResolvedValueOnce(['a'])
    setupValue.integrationRepository.list.mockClear()
    setupValue.createProvider.mockClear()
    const service = setupValue.createFreshService()

    const [first, second] = await Promise.all([service.getCurrentReport(), service.getCurrentReport()])
    expect(first).toEqual(second)
    expect(first?.articles.map((row) => row.postId)).toEqual(['a'])
    expect(first?.currentHotspots.map((row) => row.postId)).toEqual(['a'])
    expect(first?.historicalHotspots).toEqual([])
    expect(first?.publishedArticlePageViews).toBe(12)
    expect(setupValue.articleRepository.listPublishedArticleIds).toHaveBeenCalledTimes(1)
    expect(setupValue.integrationRepository.list).not.toHaveBeenCalled()
    expect(setupValue.createProvider).not.toHaveBeenCalled()
  })

  it('does not query published article ids when no snapshot exists', async () => {
    const setupValue = setup()
    await expect(setupValue.service.getCurrentReport()).resolves.toBeNull()
    expect(setupValue.articleRepository.listPublishedArticleIds).not.toHaveBeenCalled()
  })

  it('treats scheduled calls as a no-op before the configured daily time', async () => {
    const { service, provider } = setup()
    const result = await service.syncDue(new Date('2026-07-19T02:59:00.000Z'))
    expect(result.due).toBe(false)
    expect(provider.fetchReport).not.toHaveBeenCalled()
  })

  it('runs an interval schedule immediately when there is no previous success', async () => {
    const { service, provider } = setup({ state: { schedule: 'hourly' } })

    await service.syncDue(new Date('2026-07-19T00:00:00.000Z'))

    expect(provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('reports a due schedule and soft-fails scheduled sync when no report provider is configured', async () => {
    const { service, provider, stateRepository } = setup({
      providerConfigured: false,
      state: { schedule: 'hourly' }
    })

    await expect(service.getStatus(['maintenance:*'])).resolves.toMatchObject({
      due: true,
      syncSupported: false,
      configuredProvider: null
    })
    await expect(service.syncDue(new Date('2026-07-19T00:00:00.000Z'))).resolves.toMatchObject({
      syncSupported: false,
      lastError: 'Analytics report provider is not configured'
    })
    expect(stateRepository.markFailure).toHaveBeenCalledOnce()
    expect(provider.fetchReport).not.toHaveBeenCalled()
  })

  it('still rejects manual synchronization when no report provider is configured', async () => {
    const { service, provider } = setup({
      providerConfigured: false,
      state: { schedule: 'hourly' }
    })

    await expect(service.sync(['maintenance:*'])).rejects.toMatchObject({
      code: 'analytics_report_provider_unavailable',
      statusCode: 409
    })
    expect(provider.fetchReport).not.toHaveBeenCalled()
  })

  it('keeps a not-yet-due scheduled call as a no-op when no provider is configured', async () => {
    const { service, provider } = setup({ providerConfigured: false })

    await expect(service.syncDue(new Date('2026-07-19T02:59:00.000Z'))).resolves.toMatchObject({
      due: false,
      syncSupported: false
    })
    expect(provider.fetchReport).not.toHaveBeenCalled()
  })

  it.each([
    ['hourly', 60 * 60_000],
    ['every6Hours', 6 * 60 * 60_000],
    ['every12Hours', 12 * 60 * 60_000]
  ] as const)('enforces the %s elapsed-time boundary', async (schedule, interval) => {
    const now = new Date('2026-07-19T12:00:00.000Z')
    const active = {
      activeProvider: 'http-analytics-report',
      configFingerprint: 'a'.repeat(64),
      activeRevision: 'rev-active',
      publishedAt: new Date('2026-07-18T00:00:00.000Z')
    }
    const before = setup({ state: {
      ...active,
      schedule,
      lastSuccessAt: new Date(now.getTime() - interval + 1)
    } })
    const due = setup({ state: {
      ...active,
      schedule,
      lastSuccessAt: new Date(now.getTime() - interval)
    } })

    await before.service.syncDue(now)
    await due.service.syncDue(now)

    expect(before.provider.fetchReport).not.toHaveBeenCalled()
    expect(due.provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('retries a failed due interval on the next scheduler poll', async () => {
    const setupValue = setup({
      sourceFailure: true,
      state: {
        schedule: 'every6Hours',
        activeProvider: 'http-analytics-report',
        configFingerprint: 'a'.repeat(64),
        activeRevision: 'rev-active',
        publishedAt: new Date('2026-07-18T00:00:00.000Z'),
        lastSuccessAt: new Date('2026-07-19T00:00:00.000Z')
      }
    })

    await expect(setupValue.service.syncDue(new Date('2026-07-19T06:00:00.000Z')))
      .rejects.toMatchObject({ code: 'analytics_report_sync_failed' })
    await expect(setupValue.service.syncDue(new Date('2026-07-19T06:05:00.000Z')))
      .rejects.toMatchObject({ code: 'analytics_report_sync_failed' })

    expect(setupValue.provider.fetchReport).toHaveBeenCalledTimes(2)
  })

  it('uses the selected IANA timezone for a daily schedule', async () => {
    const { service, provider } = setup({ state: {
      schedule: 'daily', timeOfDay: '03:00', timezone: 'Asia/Shanghai'
    } })

    await service.syncDue(new Date('2026-07-18T18:59:00.000Z'))
    expect(provider.fetchReport).not.toHaveBeenCalled()

    await service.syncDue(new Date('2026-07-18T19:00:00.000Z'))
    expect(provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('does not repeat a daily schedule after success on the same local day', async () => {
    const { service, provider } = setup({ state: {
      schedule: 'daily',
      activeProvider: 'http-analytics-report',
      configFingerprint: 'a'.repeat(64),
      activeRevision: 'rev-active',
      publishedAt: new Date('2026-07-19T03:30:00.000Z'),
      lastSuccessAt: new Date('2026-07-19T03:30:00.000Z')
    } })

    await service.syncDue(new Date('2026-07-19T12:00:00.000Z'))

    expect(provider.fetchReport).not.toHaveBeenCalled()
  })

  it('still runs a daily schedule after a manual success earlier than the selected time', async () => {
    const { service, provider } = setup({ state: {
      schedule: 'daily',
      activeProvider: 'http-analytics-report',
      configFingerprint: 'a'.repeat(64),
      activeRevision: 'rev-active',
      publishedAt: new Date('2026-07-19T01:00:00.000Z'),
      lastSuccessAt: new Date('2026-07-19T01:00:00.000Z')
    } })

    await service.syncDue(new Date('2026-07-19T03:00:00.000Z'))

    expect(provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('waits for the selected weekly weekday and time', async () => {
    const { service, provider } = setup({ state: {
      schedule: 'weekly', dayOfWeek: 'wed', timeOfDay: '03:00', timezone: 'UTC'
    } })

    await service.syncDue(new Date('2026-07-21T12:00:00.000Z'))
    expect(provider.fetchReport).not.toHaveBeenCalled()

    await service.syncDue(new Date('2026-07-22T03:00:00.000Z'))
    expect(provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('uses the selected IANA timezone at a weekly boundary', async () => {
    const { service, provider } = setup({ state: {
      schedule: 'weekly', dayOfWeek: 'wed', timeOfDay: '03:00', timezone: 'Asia/Shanghai'
    } })

    await service.syncDue(new Date('2026-07-21T18:59:00.000Z'))
    expect(provider.fetchReport).not.toHaveBeenCalled()

    await service.syncDue(new Date('2026-07-21T19:00:00.000Z'))
    expect(provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('does not repeat a weekly schedule after the selected occurrence succeeds', async () => {
    const { service, provider } = setup({ state: {
      schedule: 'weekly',
      dayOfWeek: 'wed',
      activeProvider: 'http-analytics-report',
      configFingerprint: 'a'.repeat(64),
      activeRevision: 'rev-active',
      publishedAt: new Date('2026-07-22T04:00:00.000Z'),
      lastSuccessAt: new Date('2026-07-22T04:00:00.000Z')
    } })

    await service.syncDue(new Date('2026-07-23T12:00:00.000Z'))

    expect(provider.fetchReport).not.toHaveBeenCalled()
  })

  it('refreshes an invalidated report immediately even before a calendar schedule time', async () => {
    const { service, provider } = setup({ state: {
      schedule: 'daily',
      lastSuccessAt: new Date('2026-07-19T01:00:00.000Z')
    } })

    await service.syncDue(new Date('2026-07-19T02:00:00.000Z'))

    expect(provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('keeps manual synchronization available when automatic scheduling is off', async () => {
    const { service, provider } = setup({ state: { schedule: 'off' } })

    await service.sync(['maintenance:*'], new Date('2026-07-19T00:00:00.000Z'))

    expect(provider.fetchReport).toHaveBeenCalledOnce()
  })

  it('rejects duplicate hotspot paths as an invalid complete report', async () => {
    const { service, provider } = setup()
    vi.mocked(provider.fetchReport).mockResolvedValueOnce({
      schemaVersion: 1,
      revision: 'duplicate-hotspot',
      generatedAt: '2026-07-19T00:00:00.000Z',
      syncedThrough: '2026-07-18',
      articles: [],
      currentHotspots: [
        { path: '/posts/a', pageViews: 3, previousPageViews: 1 },
        { path: '/posts/a', pageViews: 4, previousPageViews: 2 }
      ],
      historicalHotspots: []
    })

    await expect(service.sync(['maintenance:*'])).rejects.toMatchObject({ code: 'analytics_report_invalid' })
  })

  it('requires maintenance permission for administrator operations', async () => {
    const { service } = setup()
    await expect(service.getStatus([])).rejects.toMatchObject({ statusCode: 403 })
    await expect(service.sync([])).rejects.toMatchObject({ statusCode: 403 })
  })
})
