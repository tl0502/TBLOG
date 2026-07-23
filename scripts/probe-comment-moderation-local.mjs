/**
 * One-off local probe for OpenAI-compatible comment moderation (gitignored secrets).
 * Usage: node scripts/probe-comment-moderation-local.mjs
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvFile(name) {
  try {
    const text = readFileSync(join(root, name), 'utf8')
    /** @type {Record<string, string>} */
    const env = {}
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue
      const i = line.indexOf('=')
      if (i > 0) env[line.slice(0, i)] = line.slice(i + 1)
    }
    return env
  } catch {
    return {}
  }
}

const env = { ...loadEnvFile('.env'), ...loadEnvFile('.dev.vars') }
const apiKey = env.COMMENT_MODERATION_API_KEY?.trim() || ''
const endpoint = process.argv[2] || 'https://windhub.cc/v1/chat/completions'
const model = process.argv[3] || 'deepseek-v3-2-251201'

if (!apiKey) {
  console.error('Missing COMMENT_MODERATION_API_KEY in .env or .dev.vars')
  process.exit(1)
}

const modelsUrl = endpoint.replace(/\/chat\/completions\/?$/, '/models')
console.log('key present:', apiKey.startsWith('sk-'))
console.log('endpoint:', endpoint)
console.log('modelsUrl:', modelsUrl)
console.log('model:', model)

console.log('\n--- GET models (Detect Models) ---')
const modelsRes = await fetch(modelsUrl, {
  headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' }
})
console.log('status', modelsRes.status)
const modelsJson = await modelsRes.json()
if (!modelsRes.ok) {
  console.log(modelsJson)
  process.exit(1)
}
const ids = (modelsJson.data || []).map((row) => row.id).filter(Boolean)
console.log('count', ids.length)
console.log('sample', ids.slice(0, 8).join(', '))
if (!ids.includes(model)) {
  console.warn(`WARN: configured model "${model}" is not in the models list`)
}

const systemPrompt = [
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

console.log('\n--- POST chat (Check status / moderate) ---')
const chatRes = await fetch(endpoint, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model,
    temperature: 0,
    stream: false,
    max_tokens: 300,
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          'Nickname: TBLOG Health Check',
          'Locale: en',
          'Post ID: tblog-health-check',
          'Post title: TBLOG Health Check',
          'Comment:',
          'Non-public connectivity check for the configured moderation provider.'
        ].join('\n')
      }
    ]
  })
})
console.log('status', chatRes.status)
const chatJson = await chatRes.json()
if (!chatRes.ok) {
  console.log(JSON.stringify(chatJson, null, 2))
  process.exit(1)
}
const content = chatJson.choices?.[0]?.message?.content
console.log('assistant content:', content)
try {
  const text = String(content || '').trim().replace(/^```(?:json)?\s*|\s*```$/gi, '')
  const parsed = JSON.parse(text)
  console.log('parsed decision:', parsed)
  const conf = parsed.confidence
  console.log(
    'TBLOG auto-decision eligible (confidence >= 0.9):',
    typeof conf === 'number' && conf >= 0.9 && conf <= 1
  )
} catch {
  console.error('FAIL: assistant content is not valid moderation JSON')
  process.exit(1)
}
console.log('\nLocal provider path OK. Configure admin UI with this endpoint + model, then Check status.')
