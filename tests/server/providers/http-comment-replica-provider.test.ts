import { createHttpCommentReplicaProvider } from '../../../server/providers/comment-replica/http-comment-replica-provider'

describe('HTTP comment replica provider', () => {
  it('sends a secret-authenticated public-safe lifecycle projection', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    const provider = createHttpCommentReplicaProvider({ endpoint: 'https://backup.example.com/comments', secret: 'secret', fetchImpl })
    await provider.replicate({ operation: 'remove', commentId: 'comment-1', postId: 'post-1' })
    expect(fetchImpl).toHaveBeenCalledWith('https://backup.example.com/comments', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ authorization: 'Bearer secret' })
    }))
    expect(fetchImpl.mock.calls[0]?.[1]?.body).toContain('comment-1')
  })

  it('rejects non-success responses', async () => {
    const provider = createHttpCommentReplicaProvider({ endpoint: 'https://backup.example.com/comments', secret: 'secret', fetchImpl: vi.fn().mockResolvedValue(new Response(null, { status: 503 })) })
    await expect(provider.replicate({ operation: 'remove', commentId: 'comment-1', postId: 'post-1' })).rejects.toThrow()
  })
})
