import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createSettingsServiceForEvent } from '../../../server/services/settings-service-factory'

vi.hoisted(() => {
  ;(globalThis as Record<string, unknown>).defineEventHandler = (handler: unknown) => handler
})

vi.mock('../../../server/services/settings-service-factory', () => ({
  createSettingsServiceForEvent: vi.fn()
}))

import siteConfigRoute from '../../../server/api/v1/site-config.get'

type Handler = (event: unknown) => Promise<unknown>

function makeEvent() {
  return {
    node: {
      req: { headers: {} as Record<string, string> },
      res: { statusCode: 200, setHeader: vi.fn() }
    },
    context: {}
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('public site-config route', () => {
  it('returns the public projection without dynamic response caching', async () => {
    const config = {
      site: {
        siteName: 'Blog',
        description: null,
        logoUrl: null,
        lightTheme: 'default',
        navigation: [],
        socialLinks: [],
        locale: 'zh-CN'
      },
      profile: {
        name: 'Tian',
        role: 'Writer',
        avatarUrl: null,
        shortBio: '',
        signature: '',
        introduction: '',
        topics: [],
        currentStatus: '',
        location: null,
        socialLinks: [],
        projects: [],
        journeyEnabled: false,
        journey: []
      },
      seo: {
        defaultTitle: null,
        defaultDescription: null,
        canonicalBaseUrl: null,
        robotsPolicy: 'index,follow',
        rssEnabled: true,
        sitemapEnabled: true
      },
      analytics: { enabled: false },
      comment: { enabled: true, protection: null },
      image: null
    }
    const getPublicSiteConfig = vi.fn().mockResolvedValue(config)
    vi.mocked(createSettingsServiceForEvent).mockReturnValue({ getPublicSiteConfig } as never)
    const event = makeEvent()

    const body = await (siteConfigRoute as Handler)(event)

    expect(body).toEqual({ data: config, meta: {} })
    expect(event.node.res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'no-store'
    )
  })
})
