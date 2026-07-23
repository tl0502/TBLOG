import { parseBooleanQueryFlag } from '../../server/utils/boolean-query-flag'

describe('parseBooleanQueryFlag', () => {
  it('uses the default for missing values', () => {
    expect(parseBooleanQueryFlag(undefined, true)).toBe(true)
    expect(parseBooleanQueryFlag(null, false)).toBe(false)
    expect(parseBooleanQueryFlag('', true)).toBe(true)
  })

  it('accepts common truthy and falsy query shapes', () => {
    expect(parseBooleanQueryFlag('0', true)).toBe(false)
    expect(parseBooleanQueryFlag(0, true)).toBe(false)
    expect(parseBooleanQueryFlag('false', true)).toBe(false)
    expect(parseBooleanQueryFlag(false, true)).toBe(false)
    expect(parseBooleanQueryFlag('1', false)).toBe(true)
    expect(parseBooleanQueryFlag(1, false)).toBe(true)
    expect(parseBooleanQueryFlag('true', false)).toBe(true)
    expect(parseBooleanQueryFlag(true, false)).toBe(true)
  })
})
