const MAX_AUTH_RESPONSE_BYTES = 64 * 1024

export interface UmamiCredentialInput {
  apiBaseUrl: string
  username: string
  password: string
  fetchImpl?: typeof fetch
}

function readToken(value: unknown): string {
  if (!value || typeof value !== 'object' || !('token' in value)) return ''
  const token = value.token
  return typeof token === 'string' ? token.trim() : ''
}

function canonicalApiBaseUrl(value: string): string {
  const url = new URL(value.trim())
  if (url.protocol !== 'https:') throw new Error('Umami API base URL must use HTTPS')
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('Umami API base URL must not contain credentials, query parameters, or fragments')
  }
  if (url.origin === 'https://api.umami.is') {
    throw new Error('Use an Umami Cloud API key for the Umami Cloud host')
  }
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '')
  return url.toString()
}

function endpoint(apiBaseUrl: string, path: string): URL {
  const base = new URL(apiBaseUrl)
  if (!base.pathname.endsWith('/')) base.pathname += '/'
  return new URL(path, base)
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_AUTH_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw new Error('Umami authentication response is too large')
  }
  if (!response.body) throw new Error('Umami authentication response is empty')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_AUTH_RESPONSE_BYTES) {
        await reader.cancel().catch(() => {})
        throw new Error('Umami authentication response is too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }

  try {
    return JSON.parse(text)
  } catch {
    throw new Error('Umami authentication response is invalid')
  }
}

export async function generateUmamiSelfHostedCredential(
  input: UmamiCredentialInput
): Promise<string> {
  const apiBaseUrl = canonicalApiBaseUrl(input.apiBaseUrl)
  const username = input.username.trim()
  if (!username || username.length > 512) throw new Error('Enter a valid Umami username')
  if (!input.password || input.password.length > 4_096) throw new Error('Enter a valid Umami password')

  const fetchImpl = input.fetchImpl ?? fetch
  let login: Response
  try {
    login = await fetchImpl(endpoint(apiBaseUrl, 'auth/login'), {
      method: 'POST',
      redirect: 'error',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: input.password })
    })
  } catch {
    throw new Error('Unable to reach Umami from this browser; verify HTTPS and CORS configuration')
  }
  if (!login.ok) {
    await login.body?.cancel().catch(() => {})
    throw new Error(login.status === 401
      ? 'Umami rejected the username or password'
      : `Umami login failed (HTTP ${login.status})`)
  }

  const loginBody = await readBoundedJson(login)
  const token = readToken(loginBody)
  if (!token || token.length > 16_384) throw new Error('Umami login did not return a valid token')

  let verify: Response
  try {
    verify = await fetchImpl(endpoint(apiBaseUrl, 'auth/verify'), {
      method: 'POST',
      redirect: 'error',
      headers: { accept: 'application/json', authorization: `Bearer ${token}` }
    })
  } catch {
    throw new Error('Unable to verify the generated Umami token')
  }
  if (!verify.ok) {
    await verify.body?.cancel().catch(() => {})
    throw new Error(`Umami token verification failed (HTTP ${verify.status})`)
  }
  await readBoundedJson(verify)

  return JSON.stringify({ apiBaseUrl, token })
}
