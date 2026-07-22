import { formatPublishedDate } from '../../utils/format-date'

describe('formatPublishedDate', () => {
  it('formats an ISO timestamp as YYYY-MM-DD', () => {
    expect(formatPublishedDate('2026-06-01T00:00:00.000Z')).toBe('2026-06-01')
  })
})
