import type { CommentReplicaEvent, CommentReplicaProvider } from './comment-replica-provider'

export function createHttpCommentReplicaProvider(options: {
  endpoint: string
  secret: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}): CommentReplicaProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  return {
    providerKey: 'http',
    async replicate(event: CommentReplicaEvent) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 5_000)
      try {
        const response = await fetchImpl(options.endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${options.secret}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({ version: '1', ...event })
        })
        if (!response.ok) throw new Error('Comment replica webhook failed')
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
