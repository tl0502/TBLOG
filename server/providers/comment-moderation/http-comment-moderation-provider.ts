import { z } from 'zod'
import {
  CommentModerationProviderError,
  type CommentModerationProvider,
  type CommentModerationResult
} from './comment-moderation-provider'

const MAX_RESPONSE_BYTES = 65_536

async function readLimitedResponseBody(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw new CommentModerationProviderError()
  }

  if (!response.body) return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        throw new CommentModerationProviderError()
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    reader.releaseLock()
  }
}

const responseSchema = z
  .object({
    decision: z.enum(['allow', 'reject']),
    confidence: z.number().min(0).max(1).nullable().optional().default(null),
    categories: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
    reasons: z.array(z.string().trim().min(1).max(500)).max(50).optional().default([]),
    requestId: z.string().trim().min(1).max(200).nullable().optional().default(null),
    modelVersion: z.string().trim().min(1).max(200).nullable().optional().default(null)
  })
  .strip()

export interface HttpCommentModerationProviderOptions {
  endpoint: string
  apiKey: string
  model?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export function createHttpCommentModerationProvider(
  options: HttpCommentModerationProviderOptions
): CommentModerationProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000

  return {
    providerKey: 'http',
    async moderate(input): Promise<CommentModerationResult> {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchImpl(options.endpoint, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            version: '1',
            model: options.model ?? null,
            moderatedFields: ['nickname', 'content'],
            comment: {
              nickname: input.nickname,
              content: input.content,
              locale: input.locale
            },
            post: input.post
          })
        })

        if (!response.ok) {
          throw new CommentModerationProviderError()
        }

        const text = await readLimitedResponseBody(response)

        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          throw new CommentModerationProviderError()
        }

        const parsed = responseSchema.safeParse(json)
        if (!parsed.success) {
          throw new CommentModerationProviderError()
        }

        return {
          decision: parsed.data.decision,
          confidence: parsed.data.confidence,
          categories: parsed.data.categories,
          reasons: parsed.data.reasons,
          providerRequestId: parsed.data.requestId,
          modelVersion: parsed.data.modelVersion
        }
      } catch (error) {
        if (error instanceof CommentModerationProviderError) {
          throw error
        }
        throw new CommentModerationProviderError()
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
