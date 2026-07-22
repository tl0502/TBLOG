#!/usr/bin/env node
// Portable HTTP smoke test for a running TBLOG surface (a local `wrangler pages dev` preview, or any
// deployed Cloudflare Pages origin). It exercises the end-to-end flow that unit and component tests
// cannot: real HTTP, real session cookies, real D1 reads and writes.

//   Local:    pnpm build && pnpm drizzle:migrate:local && pnpm preview   # in one terminal
//             pnpm smoke:local                                            # in another
//   Deployed: BASE_URL=https://your-app.pages.dev SMOKE_ADMIN_USER=... SMOKE_ADMIN_PASS=... pnpm smoke:local

// Configuration (environment only — nothing is read from or written to disk):
//   BASE_URL           default http://127.0.0.1:8788
//   SMOKE_ADMIN_USER   local-only default smoke_admin; required for non-loopback targets
//   SMOKE_ADMIN_PASS   local-only default smoke-admin-secret-2026; required for non-loopback targets
//   SMOKE_HTTP_TIMEOUT_MS  per-request (including response-body) timeout, default 10000

const DEFAULT_BASE_URL = 'http://127.0.0.1:8788'
const DEFAULT_ADMIN_USER = 'smoke_admin'
const DEFAULT_ADMIN_PASS = 'smoke-admin-secret-2026'
const BASE_URL = (process.env.BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '')
const ADMIN_USER = process.env.SMOKE_ADMIN_USER || DEFAULT_ADMIN_USER
const ADMIN_PASS = process.env.SMOKE_ADMIN_PASS || DEFAULT_ADMIN_PASS
const HTTP_TIMEOUT_MS = Number(process.env.SMOKE_HTTP_TIMEOUT_MS || 10000)

const stamp = Date.now()
const slug = `smoke-post-${stamp}`
const title = `Smoke Post ${stamp}`
const commentBody = `Smoke comment ${stamp}`
const privacyEmail = `smoke-privacy-${stamp}@example.com`

let cookie = null
let step = 0

class SmokeFailure extends Error {
  constructor(label, detail) {
    super(`${label}: ${detail}`)
    this.label = label
    this.detail = detail
  }
}

function isLoopbackUrl(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return hostname === 'localhost' || hostname === '::1' || /^127(?:\.\d{1,3}){3}$/.test(hostname)
  } catch {
    return false
  }
}

function validateConfiguration() {
  if (!Number.isFinite(HTTP_TIMEOUT_MS) || HTTP_TIMEOUT_MS < 1000 || HTTP_TIMEOUT_MS > 120000) {
    throw new SmokeFailure(
      'configuration',
      'SMOKE_HTTP_TIMEOUT_MS must be between 1000 and 120000 milliseconds.'
    )
  }

  let url
  try {
    url = new URL(BASE_URL)
  } catch {
    throw new SmokeFailure('configuration', `BASE_URL is not a valid URL: ${BASE_URL}`)
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new SmokeFailure('configuration', 'BASE_URL must use http:// or https://.')
  }

  // The historical credentials are intentionally convenient for an isolated local preview only.
  // Never send them to a LAN, staging, or public deployment, and never silently bootstrap one.
  if (!isLoopbackUrl(BASE_URL)) {
    const explicitUser = Object.prototype.hasOwnProperty.call(process.env, 'SMOKE_ADMIN_USER')
    const explicitPass = Object.prototype.hasOwnProperty.call(process.env, 'SMOKE_ADMIN_PASS')
    if (!explicitUser || !explicitPass || !process.env.SMOKE_ADMIN_USER || !process.env.SMOKE_ADMIN_PASS) {
      throw new SmokeFailure(
        'configuration',
        'Non-loopback targets require explicit SMOKE_ADMIN_USER and SMOKE_ADMIN_PASS credentials.'
      )
    }
    if (ADMIN_USER === DEFAULT_ADMIN_USER || ADMIN_PASS === DEFAULT_ADMIN_PASS) {
      throw new SmokeFailure('configuration', 'Non-loopback targets cannot use the local smoke default credentials.')
    }
  }
}

function log(message) {
  process.stdout.write(`${message}\n`)
}

function fail(label, detail) {
  throw new SmokeFailure(label, detail)
}

function readSetCookie(headers) {
  // undici exposes getSetCookie() (one entry per header); fall back to the comma-joined string.
  const list = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : null
  const raw = list && list.length ? list.join(', ') : headers.get('set-cookie')
  if (!raw) return
  const match = /(?:^|,\s*)(tblog_session=[^;]*)/.exec(raw)
  if (match) cookie = match[1]
}

async function http(method, path, options = {}) {
  step += 1
  const label = options.label || `${method} ${path}`
  const headers = { accept: 'application/json' }
  if (options.body !== undefined) headers['content-type'] = 'application/json'
  if (cookie) headers.cookie = cookie

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  let res
  let text
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      redirect: 'manual',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    })
    readSetCookie(res.headers)
    text = await res.text()
  } catch (error) {
    const detail = error?.name === 'AbortError'
      ? `Timed out after ${HTTP_TIMEOUT_MS}ms. Is a server running at ${BASE_URL}?`
      : `Network error: ${error?.message}. Is a server running at ${BASE_URL}?`
    fail(label, detail)
  } finally {
    clearTimeout(timer)
  }

  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    // Non-JSON body (HTML, XML, or plain text) — leave json null and inspect text.
  }

  const allowed = Array.isArray(options.expect)
    ? options.expect
    : options.expect !== undefined
      ? [options.expect]
      : null
  if (allowed && !allowed.includes(res.status)) {
    const apiError = json?.error ? ` ${JSON.stringify(json.error)}` : ` ${text.slice(0, 300)}`
    fail(label, `Expected status ${allowed.join(' or ')}, got ${res.status}.${apiError}`)
  }

  log(`  [${String(step).padStart(2, '0')}] ${label} -> ${res.status}`)
  return { res, text, json }
}

function contentType(res) {
  return res.headers.get('content-type') || ''
}

async function requestFeed(path, label, enabled, expectedArticlePath, expectedTitle = null) {
  // Published content can be briefly hidden by a public SWR cache. Retry boundedly while retaining
  // strict enabled/disabled assertions; this avoids accepting a permanently wrong route.
  const attempts = 4
  let last
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await http('GET', path, { expect: [200, 404], label: `${label} (attempt ${attempt}/${attempts})` })
    const typeOk = contentType(last.res).toLowerCase().includes('xml')
    const xmlBody = /^\s*<\?xml|^\s*<(?:rss|urlset)\b/i.test(last.text)
    const bodyOk =
      last.res.status === 200 && typeOk && xmlBody && last.text.includes(expectedArticlePath)
    const titleOk = expectedTitle === null || last.text.includes(expectedTitle)
    if (enabled && last.res.status === 200 && bodyOk && titleOk) return last
    if (!enabled && last.res.status === 404) return last
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
  }

  if (enabled) {
    const titleDetail = expectedTitle ? ` and title ${expectedTitle}` : ''
    const detail = `Expected 200 XML containing ${expectedArticlePath}${titleDetail}; got ${last.res.status}`
    fail(label, `${detail} with content-type ${contentType(last.res)}.`)
  }
  fail(label, `Expected 404 while disabled; got ${last.res.status}.`)
}

async function bestEffort(label, operation) {
  try {
    await operation()
  } catch (error) {
    log(`  [CLEANUP] ${label} failed: ${error?.detail || error?.message || String(error)}`)
  }
}

async function main() {
  validateConfiguration()
  log(`TBLOG smoke test against ${BASE_URL}`)
  log(`  post slug: ${slug}`)

  let postId = null
  let commentId = null
  try {
    // 1. First-admin setup, or login when the instance is already initialized.
    const status = await http('GET', '/api/v1/admin/setup/status', { expect: 200, label: 'setup status' })
    const setupRequired = status.json?.data?.required
    if (setupRequired === true) {
      await http('POST', '/api/v1/admin/setup', {
        label: 'first-admin setup',
        expect: 200,
        body: { username: ADMIN_USER, password: ADMIN_PASS }
      })
    } else {
      await http('POST', '/api/v1/admin/sessions', {
        label: 'admin login (already initialized)',
        expect: 200,
        body: { username: ADMIN_USER, password: ADMIN_PASS }
      })
    }
    if (!cookie) fail('authentication', 'No tblog_session cookie was issued by setup/login.')

    // 2. Authenticated admin identity.
    const me = await http('GET', '/api/v1/admin/me', { expect: 200, label: 'GET /api/v1/admin/me' })
    if (me.json?.data?.administrator?.username !== ADMIN_USER) {
      fail('GET /api/v1/admin/me', `Unexpected admin identity: ${JSON.stringify(me.json?.data?.administrator)}`)
    }

    // 3. Create a draft post, then publish it.
    const created = await http('POST', '/api/v1/admin/posts', {
      label: 'create draft post',
      expect: 201,
      body: { type: 'article', title, slug, markdown: `# ${title}\n\nHello from the smoke test.` }
    })
    postId = created.json?.data?.id
    if (!postId) fail('create draft post', `No post id in response: ${created.text.slice(0, 200)}`)
    await http('PATCH', `/api/v1/admin/posts/${postId}`, {
      label: 'publish post',
      expect: 200,
      body: { status: 'published' }
    })

    // 4. Public read of the published post: API projection + SSR HTML.
    const detail = await http('GET', `/api/v1/posts/${slug}`, { expect: 200, label: 'public post detail API' })
    if (detail.json?.data?.slug !== slug) {
      fail('public post detail API', `slug mismatch: ${JSON.stringify(detail.json?.data?.slug)}`)
    }
    const htmlPage = await http('GET', `/posts/${slug}`, { expect: 200, label: 'public post HTML page' })
    if (!contentType(htmlPage.res).includes('text/html')) {
      fail('public post HTML page', `Unexpected content-type: ${contentType(htmlPage.res)}`)
    }
    if (!htmlPage.text.includes(title)) {
      fail('public post HTML page', 'Published title not found in server-rendered HTML.')
    }

    // 5. Public site configuration projection (also controls feed gating assertions).
    const siteConfig = await http('GET', '/api/v1/site-config', { expect: 200, label: 'GET /api/v1/site-config' })
    if (!siteConfig.json?.data?.site || !siteConfig.json?.data?.seo) {
      fail('GET /api/v1/site-config', 'Missing site or SEO projection in response.')
    }
    const { rssEnabled, sitemapEnabled } = siteConfig.json.data.seo
    if (typeof rssEnabled !== 'boolean' || typeof sitemapEnabled !== 'boolean') {
      fail('GET /api/v1/site-config', 'SEO projection must include boolean rssEnabled and sitemapEnabled fields.')
    }
    const publicArticlePath = `/posts/${slug}`

    // 6. SEO endpoints. Enabled feeds must be real XML containing this article; disabled feeds are 404.
    await requestFeed('/rss.xml', 'GET /rss.xml', rssEnabled, publicArticlePath, title)
    await requestFeed('/sitemap.xml', 'GET /sitemap.xml', sitemapEnabled, publicArticlePath)
    const robots = await http('GET', '/robots.txt', { expect: 200, label: 'GET /robots.txt' })
    if (!contentType(robots.res).includes('text/plain')) {
      fail('GET /robots.txt', `Unexpected content-type: ${contentType(robots.res)}`)
    }

    // 7. Comment lifecycle with an email that must never surface on a public read.
    const submitted = await http('POST', `/api/v1/posts/${slug}/comments`, {
      label: 'submit public comment (with email)',
      expect: 201,
      body: { nickname: 'Smoke Reader', email: privacyEmail, content: commentBody }
    })
    commentId = submitted.json?.data?.id
    if (!commentId) fail('submit public comment', `No comment id in response: ${submitted.text.slice(0, 200)}`)
    const beforeApproval = await http('GET', `/api/v1/posts/${slug}/comments`, {
      label: 'public comments before approval',
      expect: 200
    })
    const beforeItems = beforeApproval.json?.data ?? []
    if (beforeItems.some((c) => c.content === commentBody)) {
      fail('comment moderation', 'A pending comment appeared in the public list before approval.')
    }
    if (beforeApproval.text.includes(privacyEmail)) {
      fail('comment privacy', 'Email address present in the public comment list (pre-approval).')
    }
    await http('PATCH', `/api/v1/admin/comments/${commentId}`, {
      label: 'admin approve comment',
      expect: 200,
      body: { status: 'approved' }
    })
    const afterApproval = await http('GET', `/api/v1/posts/${slug}/comments`, {
      label: 'public comments after approval',
      expect: 200
    })
    const afterItems = afterApproval.json?.data ?? []
    if (!afterItems.some((c) => c.content === commentBody)) {
      fail('comment moderation', 'The approved comment is missing from the public list.')
    }
    if (afterApproval.text.includes(privacyEmail)) {
      fail('comment privacy', 'PUBLIC COMMENT LIST LEAKS THE COMMENTER EMAIL after approval.')
    }
    if (afterItems.some((c) => Object.prototype.hasOwnProperty.call(c, 'email'))) {
      fail('comment privacy', 'A public comment object carries an "email" field.')
    }

    // 8. Explicit cleanup and removal verification. The finally block repeats this best-effort on any failure.
    await http('DELETE', `/api/v1/admin/posts/${postId}`, { label: 'cleanup: delete post', expect: 200 })
    postId = null
    commentId = null
    const gone = await http('GET', `/api/v1/posts/${slug}`, { label: 'verify post removed', expect: 404 })
    if (gone.json?.error?.code !== 'not_found') {
      fail('verify post removed', `Expected not_found error, got: ${gone.text.slice(0, 200)}`)
    }
    log(`\n[PASS] ${step} steps passed. No email leaked on any public comment read.`)
  } catch (error) {
    const failure = error instanceof SmokeFailure
      ? error
      : new SmokeFailure('unexpected error', error?.stack || error?.message || String(error))
    log(`\n[FAIL] step ${step}: ${failure.label}`)
    log(`       ${failure.detail}`)
    process.exitCode = 1
  } finally {
    // Deleting the post cascades comments, but attempt both resources so a partial failure does not
    // leave public test data behind. Logout is best-effort as well.
    if (cookie) {
      if (commentId) {
        await bestEffort('delete smoke comment', () =>
          http('DELETE', `/api/v1/admin/comments/${commentId}`, {
            expect: [200, 204, 404],
            label: 'cleanup: delete comment'
          })
        )
      }
      if (postId) {
        await bestEffort('delete smoke post', () =>
          http('DELETE', `/api/v1/admin/posts/${postId}`, {
            expect: [200, 404],
            label: 'cleanup: delete post'
          })
        )
      }
      await bestEffort('logout smoke session', () =>
        http('DELETE', '/api/v1/admin/sessions/current', {
          expect: 200,
          label: 'cleanup: logout'
        })
      )
    }
  }
}

main().catch((error) => {
  const failure = error instanceof SmokeFailure
    ? error
    : new SmokeFailure('unexpected error', error?.stack || error?.message || String(error))
  log(`\n[FAIL] step ${step}: ${failure.label}`)
  log(`       ${failure.detail}`)
  process.exitCode = 1
})
