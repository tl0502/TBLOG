import {
  isAdminIpAllowed,
  normalizeIpAddress
} from '../../../server/utils/admin-request-ip'

function rule(type: 'allow' | 'deny', ipAddress: string) {
  return { id: `${type}-${ipAddress}`, type, ipAddress, createdAt: new Date() }
}

describe('administrator request IP policy', () => {
  it('normalizes IPv4, IPv6, and IPv4-mapped IPv6 addresses', () => {
    expect(normalizeIpAddress(' 192.0.2.1 ')).toBe('192.0.2.1')
    expect(normalizeIpAddress('2001:0db8:0:0:0:0:0:1')).toBe('2001:db8::1')
    expect(normalizeIpAddress('::ffff:192.0.2.1')).toBe('192.0.2.1')
    expect(normalizeIpAddress('not-an-ip')).toBeNull()
  })

  it('applies deny first and makes a non-empty allow list default-deny', () => {
    expect(isAdminIpAllowed(null, [])).toBe(true)
    expect(isAdminIpAllowed('192.0.2.1', [rule('deny', '192.0.2.1')])).toBe(false)
    expect(isAdminIpAllowed('192.0.2.2', [rule('allow', '192.0.2.1')])).toBe(false)
    expect(isAdminIpAllowed('192.0.2.1', [rule('allow', '192.0.2.1')])).toBe(true)
    expect(isAdminIpAllowed('192.0.2.1', [
      rule('allow', '192.0.2.1'), rule('deny', '192.0.2.1')
    ])).toBe(false)
  })
})
