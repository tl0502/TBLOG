import { z } from 'zod'
import {
  CommentModerationProviderError,
  type CommentModerationInput,
  type CommentModerationProvider,
  type CommentModerationResult
} from './comment-moderation-provider'

const MAX_RESPONSE_BYTES = 65_536
const MAX_COMPLETION_TOKENS = 300

export const OPENAI_COMPAT_MODERATION_SYSTEM_PROMPT = [
  'You are a blog comment moderation classifier.',
  'Decide whether the submitted comment should be published.',
  'Reply with a single JSON object only. No markdown fences, no prose.',
  'Schema:',
  '{"decision":"allow"|"reject","confidence":0.0-1.0,"categories":string[],"reasons":string[]}',
  'Rules:',
  '- allow: safe enough to publish',
  '- reject: spam, abuse, hate, scams, sexual content involving minors, or other policy violations',
  '- confidence is how sure you are (0-1); use values >= 0.9 only when certain',
  '- categories and reasons must be short English tokens/phrases',
  '- judge only the provided nickname, comment, locale, and post metadata'
].join('\n')

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

const decisionSchema = z
  .object({
    decision: z.enum(['allow', 'reject']),
    confidence: z.number().min(0).max(1).nullable().optional().default(null),
    categories: z.array(z.string().trim().min(1).max(100)).max(50).optional().default([]),
    reasons: z.array(z.string().trim().min(1).max(500)).max(50).optional().default([])
  })
  .strip()

const chatCompletionSchema = z
  .object({
    id: z.string().trim().min(1).max(200).optional(),
    model: z.string().trim().min(1).max(200).optional(),
    choices: z
      .array(
        z
          .object({
            message: z
              .object({
                content: z.string().min(1).max(8_000)
              })
              .strip()
          })
          .strip()
      )
      .min(1)
  })
  .strip()

function moderationUserMessage(input: CommentModerationInput): string {
  return [
    `Nickname: ${input.nickname}`,
    `Locale: ${input.locale}`,
    `Post ID: ${input.post.id}`,
    `Post title: ${input.post.title}`,
    `Comment:\n${input.content}`
  ].join('\n')
}

/** Extract a JSON object from plain model output or a fenced ```json block. */
export function extractJsonObject(content: string): string {
  const trimmed = content.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const candidate = (fenced?.[1] ?? trimmed).trim()
  if (candidate.startsWith('{') && candidate.endsWith('}')) return candidate

  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start >= 0 && end > start) return candidate.slice(start, end + 1)

  throw new CommentModerationProviderError()
}

function normalizeDecision(
  content: string,
  envelope: z.infer<typeof chatCompletionSchema>,
  fallbackModel: string
): CommentModerationResult {
  let json: unknown
  try {
    json = JSON.parse(extractJsonObject(content))
  } catch (error) {
    if (error instanceof CommentModerationProviderError) throw error
    throw new CommentModerationProviderError()
  }

  const parsed = decisionSchema.safeParse(json)
  if (!parsed.success) throw new CommentModerationProviderError()

  return {
    decision: parsed.data.decision,
    confidence: parsed.data.confidence,
    categories: parsed.data.categories,
    reasons: parsed.data.reasons,
    providerRequestId: envelope.id ?? null,
    modelVersion: envelope.model ?? fallbackModel
  }
}

const MAX_LISTED_MODELS = 200

const modelsListSchema = z
  .object({
    data: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(200).optional()
          })
          .passthrough()
      )
      .max(2_000)
  })
  .strip()

/**
 * Derive the OpenAI-compatible models list URL from a chat completions endpoint.
 * `.../v1/chat/completions` → `.../v1/models`
 */
export function deriveOpenAiCompatibleModelsUrl(chatCompletionsUrl: string): string {
  let url: URL
  try {
    url = new URL(chatCompletionsUrl)
  } catch {
    throw new CommentModerationProviderError()
  }
  const path = url.pathname.replace(/\/+$/u, '')
  if (!path.endsWith('/chat/completions')) {
    throw new CommentModerationProviderError()
  }
  url.pathname = `${path.slice(0, -'/chat/completions'.length)}/models`
  url.search = ''
  url.hash = ''
  return url.toString()
}

/**
 * Rewrite a target OpenAI-compatible URL through an optional reverse-proxy base.
 * Workers cannot use SOCKS/HTTP CONNECT proxies; this swaps the origin (and optional path prefix)
 * so Cloudflare can reach a public bridge that then talks to the upstream gateway.
 *
 * - target `https://windhub.cc/v1/chat/completions`
 * - proxy  `https://bridge.example.com` → `https://bridge.example.com/v1/chat/completions`
 * - proxy  `https://bridge.example.com/openai` → `https://bridge.example.com/openai/v1/chat/completions`
 */
export function applyProxyBaseUrl(
  targetUrl: string,
  proxyBaseUrl: string | null | undefined
): string {
  const proxy = typeof proxyBaseUrl === 'string' ? proxyBaseUrl.trim() : ''
  if (!proxy) return targetUrl
  let target: URL
  let base: URL
  try {
    target = new URL(targetUrl)
    base = new URL(proxy)
  } catch {
    throw new CommentModerationProviderError()
  }
  const prefix = base.pathname.replace(/\/+$/u, '')
  const prefixPath = prefix === '/' ? '' : prefix
  const path = `${prefixPath}${target.pathname.startsWith('/') ? target.pathname : `/${target.pathname}`}`
  return `${base.origin}${path}${target.search}`
}

export interface ListOpenAiCompatibleModelsOptions {
  endpoint: string
  apiKey: string
  /** Optional public HTTPS reverse-proxy base (origin or origin+prefix). */
  proxyBaseUrl?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

/** GET /v1/models against an OpenAI-compatible gateway. */
export async function listOpenAiCompatibleModels(
  options: ListOpenAiCompatibleModelsOptions
): Promise<string[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const modelsUrl = applyProxyBaseUrl(
    deriveOpenAiCompatibleModelsUrl(options.endpoint),
    options.proxyBaseUrl
  )
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetchImpl(modelsUrl, {
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${options.apiKey}`
      }
    })
    // Public-safe status only — never surface response bodies (may include provider error text).
    if (!response.ok) {
      throw new CommentModerationProviderError(
        `Gateway models request failed (HTTP ${response.status})`
      )
    }

    const text = await readLimitedResponseBody(response)
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new CommentModerationProviderError('Gateway models response was not valid JSON')
    }

    const parsed = modelsListSchema.safeParse(json)
    if (!parsed.success) {
      throw new CommentModerationProviderError('Gateway models response shape is not OpenAI-compatible')
    }

    const ids = [...new Set(
      parsed.data.data
        .map((entry) => entry.id?.trim() ?? '')
        .filter((id) => id.length > 0)
    )].sort((left, right) => left.localeCompare(right))
    if (ids.length === 0) {
      throw new CommentModerationProviderError('Gateway returned an empty models list')
    }
    return ids.slice(0, MAX_LISTED_MODELS)
  } catch (error) {
    if (error instanceof CommentModerationProviderError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CommentModerationProviderError(
        `Gateway models request timed out after ${timeoutMs}ms`
      )
    }
    // Network / DNS / TLS / blocked egress — common when Workers edge IPs differ from local ISP.
    throw new CommentModerationProviderError(
      'Gateway models request failed (network error; edge egress may be blocked)'
    )
  } finally {
    clearTimeout(timeout)
  }
}

export interface HttpCommentModerationProviderOptions {
  /** Full OpenAI-compatible chat completions URL, e.g. https://api.example.com/v1/chat/completions */
  endpoint: string
  apiKey: string
  model: string
  /** Optional public HTTPS reverse-proxy base used when Workers cannot reach the upstream host. */
  proxyBaseUrl?: string | null
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export function createHttpCommentModerationProvider(
  options: HttpCommentModerationProviderOptions
): CommentModerationProvider {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? 5_000
  const model = options.model.trim()
  if (!model) throw new CommentModerationProviderError()
  const chatUrl = applyProxyBaseUrl(options.endpoint, options.proxyBaseUrl)

  return {
    providerKey: 'http',
    async moderate(input): Promise<CommentModerationResult> {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetchImpl(chatUrl, {
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
            temperature: 0,
            stream: false,
            max_tokens: MAX_COMPLETION_TOKENS,
            messages: [
              { role: 'system', content: OPENAI_COMPAT_MODERATION_SYSTEM_PROMPT },
              { role: 'user', content: moderationUserMessage(input) }
            ]
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

        const envelope = chatCompletionSchema.safeParse(json)
        if (!envelope.success) throw new CommentModerationProviderError()

        const content = envelope.data.choices[0]?.message.content
        if (!content) throw new CommentModerationProviderError()
        return normalizeDecision(content, envelope.data, model)
      } catch (error) {
        if (error instanceof CommentModerationProviderError) throw error
        throw new CommentModerationProviderError()
      } finally {
        clearTimeout(timeout)
      }
    }
  }
}
