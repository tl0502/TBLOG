import { buildAnalyticsHead } from '../../utils/analytics-head'
import { sanitizeAnalyticsScriptAttributes } from '../../utils/analytics-script-attributes'
import type { PublicAnalyticsConfig } from '../../types/public-view'

function enabled(overrides: Partial<Extract<PublicAnalyticsConfig, { enabled: true }>>): PublicAnalyticsConfig {
  return {
    enabled: true,
    providerKey: null,
    scriptUrl: null,
    siteId: null,
    renderConfig: {},
    ...overrides
  }
}

describe('buildAnalyticsHead', () => {
  it('injects nothing when analytics is disabled or missing', () => {
    expect(buildAnalyticsHead({ enabled: false }).script).toEqual([])
    expect(buildAnalyticsHead(undefined).script).toEqual([])
    expect(buildAnalyticsHead(null).script).toEqual([])
  })

  it('builds a Cloudflare Web Analytics beacon from the canonical provider and site token', () => {
    const head = buildAnalyticsHead(
      enabled({ providerKey: 'cloudflare-web-analytics', siteId: 'tok123' })
    )
    expect(head.script).toHaveLength(1)
    expect(head.script[0]).toMatchObject({
      key: 'tblog-analytics',
      src: 'https://static.cloudflareinsights.com/beacon.min.js',
      defer: true,
      'data-cf-beacon': JSON.stringify({ token: 'tok123' })
    })
  })

  it('builds Umami and Plausible scripts with renderer-owned provider identity', () => {
    const umami = buildAnalyticsHead(enabled({
      providerKey: 'umami',
      scriptUrl: 'https://umami.example/script.js',
      siteId: 'site-1',
      renderConfig: { 'data-website-id': 'evil', 'data-host-url': 'https://umami.example' }
    }))
    expect(umami.script[0]).toMatchObject({
      src: 'https://umami.example/script.js',
      defer: true,
      'data-website-id': 'site-1',
      'data-host-url': 'https://umami.example'
    })
    expect(umami.script[0]?.async).toBeUndefined()

    const plausible = buildAnalyticsHead(enabled({
      providerKey: 'plausible',
      scriptUrl: 'https://plausible.example/js',
      siteId: 'blog.example',
      renderConfig: { 'data-domain': 'evil.example' }
    }))
    expect(plausible.script[0]).toMatchObject({
      src: 'https://plausible.example/js',
      async: true,
      'data-domain': 'blog.example'
    })
    expect(plausible.script[0]?.defer).toBeUndefined()
  })

  it('allows only documented custom script attributes', () => {
    const head = buildAnalyticsHead(enabled({
      providerKey: 'custom',
      scriptUrl: 'https://cdn.example/a.js',
      renderConfig: {
        'data-x': 'y',
        'DATA-COUNT': 2,
        crossorigin: 'anonymous',
        referrerpolicy: 'strict-origin-when-cross-origin',
        integrity: 'sha384-YWJjZA==',
        onload: 'alert(1)',
        bad: {},
        nonce: 'secret'
      }
    }))

    expect(head.script[0]).toEqual({
      'data-x': 'y',
      'data-count': '2',
      crossorigin: 'anonymous',
      referrerpolicy: 'strict-origin-when-cross-origin',
      integrity: 'sha384-YWJjZA==',
      key: 'tblog-analytics',
      src: 'https://cdn.example/a.js',
      async: true
    })
  })

  it('never lets render config override source, execution, inline content, or provider identity', () => {
    const head = buildAnalyticsHead(enabled({
      providerKey: 'custom',
      scriptUrl: 'https://cdn.example/safe.js',
      renderConfig: {
        src: 'https://evil.example/override.js',
        key: 'evil-key',
        async: false,
        defer: true,
        type: 'text/javascript',
        innerHTML: 'alert(1)',
        textContent: 'alert(2)',
        'data-cf-beacon': 'evil',
        'data-website-id': 'evil',
        'data-domain': 'evil'
      }
    }))

    expect(head.script[0]).toEqual({
      key: 'tblog-analytics',
      src: 'https://cdn.example/safe.js',
      async: true
    })
  })

  it('explicitly no-ops native, legacy aliases, and unknown providers even with a script URL', () => {
    for (const providerKey of ['native', 'cloudflare', 'future-provider']) {
      expect(buildAnalyticsHead(enabled({
        providerKey,
        scriptUrl: 'https://cdn.example/should-not-load.js',
        siteId: 'token'
      })).script).toEqual([])
    }
  })

  it('no-ops when required fields or an HTTP(S) script URL are missing', () => {
    expect(buildAnalyticsHead(enabled({ providerKey: 'cloudflare-web-analytics' })).script).toEqual([])
    expect(buildAnalyticsHead(enabled({ providerKey: 'umami', scriptUrl: 'https://u/s.js' })).script).toEqual([])
    expect(buildAnalyticsHead(enabled({ providerKey: 'plausible', siteId: 'blog.example' })).script).toEqual([])
    expect(buildAnalyticsHead(enabled({ providerKey: 'custom' })).script).toEqual([])
    expect(buildAnalyticsHead(enabled({ providerKey: 'custom', scriptUrl: 'javascript:alert(1)' })).script).toEqual([])
    expect(buildAnalyticsHead(enabled({ providerKey: 'custom', scriptUrl: 'ftp://cdn.example/a.js' })).script).toEqual([])
  })
})

describe('sanitizeAnalyticsScriptAttributes', () => {
  it('omits invalid values for narrowly allowed non-data attributes', () => {
    expect(sanitizeAnalyticsScriptAttributes({
      crossorigin: 'invalid',
      referrerpolicy: 'invalid',
      integrity: 'not-a-subresource-integrity-value',
      'data-ok': true
    })).toEqual({ 'data-ok': 'true' })
  })
})
