import { describe, expect, it } from 'vitest'
import {
  getSessionSecretIssue,
  resolveAuthRuntimeSecrets
} from '../../../server/utils/auth-runtime-secrets'

describe('authentication service factory runtime secrets', () => {
  it('prefers raw request Cloudflare variables over process variables', () => {
    expect(resolveAuthRuntimeSecrets(
      {
        SESSION_SECRET: 'process-session',
        AUTH_ENCRYPTION_KEY: 'process-encryption'
      },
      {
        SESSION_SECRET: 'cloudflare-session',
        AUTH_ENCRYPTION_KEY: 'cloudflare-encryption'
      }
    )).toEqual({
      sessionSecret: 'cloudflare-session',
      authEncryptionKey: 'cloudflare-encryption'
    })
  })

  it('uses process variables when request Cloudflare variables are absent', () => {
    expect(resolveAuthRuntimeSecrets(
      {
        SESSION_SECRET: 'process-session',
        AUTH_ENCRYPTION_KEY: 'process-encryption'
      }
    )).toEqual({
      sessionSecret: 'process-session',
      authEncryptionKey: 'process-encryption'
    })
  })

  it('returns empty values when no runtime source provides the secrets', () => {
    expect(resolveAuthRuntimeSecrets({})).toEqual({
      sessionSecret: '',
      authEncryptionKey: ''
    })
  })

  it('classifies missing, short, placeholder, and sufficiently strong session secrets', () => {
    expect(getSessionSecretIssue('')).toBe('missing')
    expect(getSessionSecretIssue('short-secret')).toBe('too_short')
    expect(getSessionSecretIssue('replace-with-a-local-development-secret-at-least-32-characters'))
      .toBe('placeholder')
    expect(getSessionSecretIssue('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBe('placeholder')
    expect(getSessionSecretIssue('0123456789abcdef0123456789abcdef')).toBeNull()
  })
})
