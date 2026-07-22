export interface CommentRateLimit {
  windowSeconds: number
  maxPerWindow: number
}

export interface CommentRateLimiter {
  consume(key: string, limit: CommentRateLimit, now: Date): CommentRateLimitResult
}

export interface CommentRateLimitResult {
  allowed: boolean
  retryAfterSeconds: number
}

interface WindowState {
  count: number
  expiresAt: number
}

/**
 * Per-isolate, bounded protection for comment submissions and paid moderation calls. It does not
 * persist or log IP data and complements edge/WAF rate limiting on deployed sites.
 */
export function createMemoryCommentRateLimiter(maxKeys = 10_000): CommentRateLimiter {
  const capacity = Math.max(1, Math.floor(maxKeys))
  const windows = new Map<string, WindowState>()
  let nextExpiry = Number.POSITIVE_INFINITY

  function retryAfterSeconds(timestamp: number): number {
    return Math.max(1, Math.ceil((nextExpiry - timestamp) / 1_000))
  }

  function cleanupExpired(timestamp: number): void {
    nextExpiry = Number.POSITIVE_INFINITY
    for (const [candidate, state] of windows) {
      if (state.expiresAt <= timestamp) {
        windows.delete(candidate)
      } else {
        nextExpiry = Math.min(nextExpiry, state.expiresAt)
      }
    }
  }

  return {
    consume(key, limit, now) {
      const timestamp = now.getTime()
      const current = windows.get(key)
      if (!current || current.expiresAt <= timestamp) {
        if (windows.size >= capacity) {
          // No window can have expired before the tracked minimum. Reject immediately instead of
          // scanning the full table for every new identity during a churn attack.
          if (timestamp < nextExpiry) {
            return { allowed: false, retryAfterSeconds: retryAfterSeconds(timestamp) }
          }
          cleanupExpired(timestamp)
          // Refuse new identities while the bounded table is full instead of evicting active
          // identities and allowing an attacker to churn around the limiter.
          if (windows.size >= capacity) {
            return {
              allowed: false,
              retryAfterSeconds: retryAfterSeconds(timestamp)
            }
          }
        }
        const expiresAt = timestamp + limit.windowSeconds * 1_000
        windows.set(key, {
          count: 1,
          expiresAt
        })
        nextExpiry = Math.min(nextExpiry, expiresAt)
        return { allowed: true, retryAfterSeconds: 0 }
      }

      if (current.count >= limit.maxPerWindow) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - timestamp) / 1_000))
        }
      }
      current.count += 1
      return { allowed: true, retryAfterSeconds: 0 }
    }
  }
}

export const sharedCommentRateLimiter = createMemoryCommentRateLimiter()
export const sharedCommentIngressRateLimiter = createMemoryCommentRateLimiter()
