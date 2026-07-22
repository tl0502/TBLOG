import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAnalyticsReportServiceForEvent } from '../../../server/services/analytics-report-service-factory'
import { requireAdmin } from '../../../server/utils/require-admin'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/utils/require-admin', () => ({ requireAdmin: vi.fn() }))
vi.mock('../../../server/services/analytics-report-service-factory', () => ({
  createAnalyticsReportServiceForEvent: vi.fn()
}))

import statusRoute from '../../../server/api/v1/admin/analytics/reports/status.get'
import settingsRoute from '../../../server/api/v1/admin/analytics/reports/settings.put'
import syncRoute from '../../../server/api/v1/admin/analytics/reports/sync.post'

type Handler = (event: unknown) => Promise<unknown>
function event() {
  return { node: { req: { headers: {} }, res: { statusCode: 200, setHeader: vi.fn() } }, context: {} }
}

describe('administrator analytics report routes', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(requireAdmin).mockResolvedValue({ permissions: ['maintenance:*'] } as never)
  })

  it('uses the authenticated administrator permissions for status and manual sync', async () => {
    const getStatus = vi.fn().mockResolvedValue({ enabled: true })
    const sync = vi.fn().mockResolvedValue({ activeRevision: 'rev-1', due: false })
    vi.mocked(createAnalyticsReportServiceForEvent).mockReturnValue({ getStatus, sync } as never)

    await expect((statusRoute as Handler)(event())).resolves.toEqual({ data: { enabled: true }, meta: {} })
    await expect((syncRoute as Handler)(event())).resolves.toEqual({
      data: { activeRevision: 'rev-1', due: false },
      meta: {}
    })
    expect(getStatus).toHaveBeenCalledWith(['maintenance:*'])
    expect(sync).toHaveBeenCalledWith(['maintenance:*'])
  })

  it('validates schedule, weekday, time, and timezone before updating settings', async () => {
    const updateSettings = vi.fn()
    vi.mocked(createAnalyticsReportServiceForEvent).mockReturnValue({ updateSettings } as never)
    vi.stubGlobal('readBody', vi.fn().mockResolvedValue({
      enabled: true, schedule: 'monthly', timeOfDay: '25:00', timezone: 'Nope/Zone', dayOfWeek: 'someday'
    }))
    const request = event()

    const body = await (settingsRoute as Handler)(request) as { error: { code: string } }
    expect(request.node.res.statusCode).toBe(422)
    expect(body.error.code).toBe('validation_failed')
    expect(updateSettings).not.toHaveBeenCalled()
  })

  it('accepts an expanded weekly schedule and passes normalized settings to the service', async () => {
    const updateSettings = vi.fn().mockResolvedValue({ schedule: 'weekly', dayOfWeek: 'fri' })
    vi.mocked(createAnalyticsReportServiceForEvent).mockReturnValue({ updateSettings } as never)
    vi.stubGlobal('readBody', vi.fn().mockResolvedValue({
      enabled: true,
      schedule: 'weekly',
      timeOfDay: '05:30',
      timezone: 'Asia/Shanghai',
      dayOfWeek: 'fri'
    }))
    const request = event()

    await expect((settingsRoute as Handler)(request)).resolves.toEqual({
      data: { schedule: 'weekly', dayOfWeek: 'fri' }, meta: {}
    })
    expect(updateSettings).toHaveBeenCalledWith({
      enabled: true,
      schedule: 'weekly',
      timeOfDay: '05:30',
      timezone: 'Asia/Shanghai',
      dayOfWeek: 'fri'
    }, ['maintenance:*'])
  })
})
