import { getRequestHeader, getRequestIP } from 'h3'
import type { H3Event } from 'h3'
import ipaddr from 'ipaddr.js'
import type { AdministratorIpRuleRecord } from '../domain/admin-security'

export function normalizeIpAddress(value: string | undefined | null): string | null {
  const candidate = value?.trim()
  if (!candidate) return null
  try {
    return ipaddr.process(candidate).toString()
  } catch {
    return null
  }
}

export function resolveAdminRequestIp(event: H3Event): string | null {
  const cloudflareIp = normalizeIpAddress(getRequestHeader(event, 'cf-connecting-ip'))
  if (cloudflareIp) return cloudflareIp
  return normalizeIpAddress(getRequestIP(event))
}

export function isAdminIpAllowed(
  ipAddress: string | null,
  rules: Pick<AdministratorIpRuleRecord, 'type' | 'ipAddress'>[]
): boolean {
  if (rules.length === 0) return true
  if (!ipAddress) return false
  if (rules.some((rule) => rule.type === 'deny' && rule.ipAddress === ipAddress)) return false
  const allowRules = rules.filter((rule) => rule.type === 'allow')
  return allowRules.length === 0 || allowRules.some((rule) => rule.ipAddress === ipAddress)
}
