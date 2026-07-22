import {
  getRequestHeader,
  getRequestIP,
  getRequestURL,
  getRequestWebStream,
  getRouterParam,
  setResponseHeader,
  setResponseStatus,
  type H3Event
} from 'h3'
import { ZodError } from 'zod'
import { commentError } from '../../../../domain/comment-errors'
import { DomainError } from '../../../../domain/domain-error'
import {
  createCommentServiceForEvent,
  logCommentSecurityEvent
} from '../../../../services/comment-service-factory'
import { sharedCommentIngressRateLimiter } from '../../../../services/comment-rate-limiter'
import { errorResponse, ok } from '../../../../utils/api-response'
import { submitCommentInputSchema } from '../../../../validation/comment-input'
import { slugParamSchema } from '../../../../validation/public-read-input'

const MAX_COMMENT_REQUEST_BYTES = 32 * 1024
const COMMENT_INGRESS_RATE_LIMIT = { windowSeconds: 60, maxPerWindow: 20 } as const

class CommentRequestBodyError extends Error {
  constructor(public readonly kind: 'invalid' | 'too_large') {
    super(kind === 'too_large' ? 'Comment request body is too large' : 'Invalid comment request body')
    this.name = 'CommentRequestBodyError'
  }
}

function bodyChunkBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return new TextEncoder().encode(String(value))
}

async function readBoundedCommentBody(event: H3Event): Promise<unknown> {
  const contentType = getRequestHeader(event, 'content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json') throw new CommentRequestBodyError('invalid')

  const declaredLength = Number(getRequestHeader(event, 'content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_COMMENT_REQUEST_BYTES) {
    throw new CommentRequestBodyError('too_large')
  }

  const stream = getRequestWebStream(event)
  if (!stream) throw new CommentRequestBodyError('invalid')
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let total = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const bytes = bodyChunkBytes(value)
      total += bytes.byteLength
      if (total > MAX_COMMENT_REQUEST_BYTES) {
        await reader.cancel().catch(() => {})
        throw new CommentRequestBodyError('too_large')
      }
      text += decoder.decode(bytes, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new CommentRequestBodyError('invalid')
  }
}

function parsePublicArticleSlug(value: string | undefined): string {
  try {
    return slugParamSchema.parse(value)
  } catch {
    throw commentError('not_found', 'Post not found', 404)
  }
}

function resolveCommentRemoteIp(event: H3Event): string | undefined {
  try {
    // Cloudflare strips/sets this header at the edge. Local development falls back to the socket.
    return getRequestHeader(event, 'cf-connecting-ip')?.trim() || getRequestIP(event)
  } catch {
    return undefined
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'no-store')

  try {
    const remoteIp = resolveCommentRemoteIp(event)
    const ingressLimit = sharedCommentIngressRateLimiter.consume(
      `comment-ingress:${remoteIp ?? 'anonymous'}`,
      COMMENT_INGRESS_RATE_LIMIT,
      new Date()
    )
    if (!ingressLimit.allowed) {
      logCommentSecurityEvent({ event: 'comment_ingress_rate_limited' })
      throw commentError(
        'rate_limited',
        'Too many comment attempts. Please try again later',
        429,
        { retryAfterSeconds: ingressLimit.retryAfterSeconds }
      )
    }
    const slug = parsePublicArticleSlug(getRouterParam(event, 'slug'))
    const input = submitCommentInputSchema.parse(await readBoundedCommentBody(event))
    const expectedHostname = getRequestURL(event).hostname
    const command = {
      ...input,
      expectedHostname,
      ...(remoteIp ? { remoteIp } : {})
    }
    const result = await (await createCommentServiceForEvent(event)).submit(
      slug,
      command
    )
    setResponseStatus(event, 201)
    return ok(result)
  } catch (error) {
    const mapped = error instanceof CommentRequestBodyError
      ? error.kind === 'too_large'
        ? commentError('payload_too_large', 'Comment request body is too large', 413)
        : new DomainError('validation_failed', 'Invalid comment input', 422)
      : error instanceof ZodError
        ? new DomainError('validation_failed', 'Invalid comment input', 422, { issues: error.issues })
        : error
    const response = errorResponse(event, mapped)
    const retryAfterSeconds = mapped instanceof DomainError
      ? mapped.details.retryAfterSeconds
      : undefined
    if (
      mapped instanceof DomainError
      && mapped.code === 'rate_limited'
      && typeof retryAfterSeconds === 'number'
    ) {
      setResponseHeader(event, 'Retry-After', retryAfterSeconds)
    }
    setResponseStatus(event, response.statusCode)
    return response.body
  }
})
