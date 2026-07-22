import { deleteCookie, getCookie, setCookie } from 'h3'
import type { H3Event } from 'h3'
import { adminSessionPolicy } from '../../utils/security-policy'

export const sessionCookieName = 'tblog_session'
export const sessionTtlSeconds = adminSessionPolicy.ttlSeconds

export function getSessionCookie(event: H3Event): string | undefined {
  return getCookie(event, sessionCookieName)
}

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, sessionCookieName, token, {
    httpOnly: true,
    sameSite: adminSessionPolicy.sameSite,
    secure: adminSessionPolicy.secure,
    path: '/',
    maxAge: sessionTtlSeconds
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, sessionCookieName, {
    httpOnly: true,
    sameSite: adminSessionPolicy.sameSite,
    secure: adminSessionPolicy.secure,
    path: '/'
  })
}
