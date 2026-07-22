import { createUnconfiguredCommentProtectionProvider } from '../../../server/providers/comment-protection/unconfigured-comment-protection-provider'

afterEach(() => vi.restoreAllMocks())

describe('unconfigured comment protection provider', () => {
  it('permits submission without making a network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('Unexpected network request')
    })
    const provider = createUnconfiguredCommentProtectionProvider()

    await expect(provider.verify({ token: undefined })).resolves.toBeUndefined()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
