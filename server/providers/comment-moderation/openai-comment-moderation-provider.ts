import { z } from 'zod'
import {
  CommentModerationProviderError,
  type CommentModerationInput,
  type CommentModerationProvider,
  type CommentModerationResult
} from './comment-moderation-provider'

export const OPENAI_MODERATION_ENDPOINT = 'https://api.openai.com/v1/moderations'
export const DEFAULT_OPENAI_MODERATION_MODEL = 'omni-moderation-latest'

const MAX_RESPONSE_BYTES = 65_536
const categoryScoreSchema = z.number().finite().min(0).max(1)
const moderationResultSchema = z.object({
  flagged: z.boolean(),
  categories: z.record(z.string(), z.boolean()),
  category_scores: z.record(z.string(), categoryScoreSchema)
}).strip()
const moderationResponseSchema = z.object({
  id: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1).max(200),
  results: z.array(moderationResultSchema).length(1)
}).strip()

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

function moderationText(input: CommentModerationInput): string {
  return [
    `Nickname: ${input.nickname}`,
    `Locale: ${input.locale}`,
    `Post ID: ${input.post.id}`,
    `Post title: ${input.post.title}`,
    `Comment:\n${input.content}`
  ].join('\n')
}

function normalizeResult(response: z.infer<typeof moderationResponseSchema>): CommentModerationResult {
  const result = response.results[0]
  const flaggedCategories = Object.entries(result.categories)
    .filter(([, flagged]) => flagged)
    .map(([category]) => category)
  const scores = Object.values(result.category_scores)

  if (scores.length === 0 || result.flagged !== (flaggedCategories.length > 0)) {
    throw new CommentModerationProviderError()
  }

  const confidence = result.flagged
    ? Math.max(...flaggedCategories.map((category) => {
        const score = result.category_scores[category]
        if (typeof score !== 'number') throw new CommentModerationProviderError()
        return score
      }))
    : null

  return {
    decision: result.flagged ? 'reject' : 'allow',
    confidence: confidence === null ? null : Math.max(0, Math.min(1, confidence)),
    categories: flaggedCategories,
    reasons: flaggedCategories.map((category) => `OpenAI moderation flagged category: ${category}`),
    providerRequestId: response.id,
    modelVersion: response.model
  }
}

export interface OpenAiCommentModerationProviderOptions {
  apiKey: string
  model?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export function createOpenAiCommentModerationProvider(
  options: OpenAiCommentModerationProviderOptions
): CommentModerationProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const model = options.model ?? DEFAULT_OPENAI_MODERATION_MODEL
  const timeoutMs = options.timeoutMs ?? 5_000

  return {
    providerKey: 'openai',
    async moderate(input): Promise<CommentModerationResult> {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchImpl(OPENAI_MODERATION_ENDPOINT, {
          method: 'POST',
          redirect: 'error',
          signal: controller.signal,
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json'
          },
          body: JSON.stringify({
            model,
            input: moderationText(input)
          })
        })

        if (!response.ok) throw new CommentModerationProviderError()

        const text = await readLimitedResponseBody(response)
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          throw new CommentModerationProviderError()
        }

        const parsed = moderationResponseSchema.safeParse(json)
        if (!parsed.success) throw new CommentModerationProviderError()
        return normalizeResult(parsed.data)
      } catch (error) {
        if (error instanceof CommentModerationProviderError) throw error
        throw new CommentModerationProviderError()
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
