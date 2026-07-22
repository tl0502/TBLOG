import { escapeXml, toRfc822, toW3CDate } from '../../../server/utils/xml'

describe('xml helpers', () => {
  it('escapes the five XML predefined entities', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f')
    expect(escapeXml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeXml('Hello World')).toBe('Hello World')
  })

  it('formats RFC-822 dates for RSS pubDate', () => {
    expect(toRfc822(new Date('2026-06-01T00:00:00.000Z'))).toBe('Mon, 01 Jun 2026 00:00:00 GMT')
  })

  it('formats W3C dates (seconds precision) for sitemap lastmod', () => {
    expect(toW3CDate(new Date('2026-06-01T12:30:45.678Z'))).toBe('2026-06-01T12:30:45Z')
  })
})
