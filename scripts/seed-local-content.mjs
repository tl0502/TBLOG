#!/usr/bin/env node
/**
 * Seed the local Wrangler D1 database with demo categories, tags, articles,
 * an About page, and comments. Idempotent for fixed `seed-*` ids.
 *
 * Usage:
 *   node scripts/seed-local-content.mjs
 *   pnpm seed:local
 */
import Database from 'better-sqlite3'
import GithubSlugger from 'github-slugger'
import { toString } from 'mdast-util-to-string'
import rehypeHighlight from 'rehype-highlight'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeStringify from 'rehype-stringify'
import remarkGfm from 'remark-gfm'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { unified } from 'unified'
import { visit } from 'unist-util-visit'
import { readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROCESSOR_VERSION = 'content-pipeline-v1'

/** @returns {string} */
function findLocalD1Path() {
  const dir = join(root, '.wrangler', 'state', 'v3', 'd1', 'miniflare-D1DatabaseObject')
  let candidates = []
  try {
    candidates = readdirSync(dir)
      .filter((name) => name.endsWith('.sqlite'))
      .map((name) => join(dir, name))
  } catch {
    throw new Error(
      'Local D1 database not found. Run `pnpm drizzle:migrate:local` first (or start the app once).'
    )
  }
  if (candidates.length === 0) {
    throw new Error('No local D1 .sqlite file under .wrangler/state/v3/d1/. Apply migrations first.')
  }
  candidates.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return candidates[0]
}

const sanitizeSchema = {
  ...defaultSchema,
  clobberPrefix: '',
  attributes: {
    ...defaultSchema.attributes,
    h2: [...(defaultSchema.attributes?.h2 ?? []), 'id'],
    h3: [...(defaultSchema.attributes?.h3 ?? []), 'id'],
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^language-/, 'hljs']],
    span: [...(defaultSchema.attributes?.span ?? []), ['className', /^hljs-/]],
    pre: [...(defaultSchema.attributes?.pre ?? []), ['className', /^language-/, 'hljs']]
  }
}

/**
 * Same pipeline shape as server/content/markdown-processor.ts (seed-side copy so we stay ESM-plain).
 * @param {string} markdown
 */
async function processMarkdown(markdown) {
  if (!String(markdown).trim()) {
    return {
      html: '',
      toc: [],
      excerpt: '',
      readingTime: 0,
      plainTextSearchBody: '',
      codeMeta: [],
      processorVersion: PROCESSOR_VERSION
    }
  }

  /** @type {Array<{ id: string, depth: 2 | 3, text: string }>} */
  const toc = []
  /** @type {Array<Record<string, unknown>>} */
  const codeMeta = []
  let plainTextSearchBody = ''

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(() => (tree) => {
      const slugger = new GithubSlugger()
      const parts = (tree.children ?? [])
        .filter((child) => child.type !== 'html')
        .map((child) => toString(child))
        .filter(Boolean)
      plainTextSearchBody = parts.join(' ').replace(/\s+/g, ' ').trim()

      visit(tree, 'heading', (node) => {
        if (node.depth !== 2 && node.depth !== 3) return
        const text = toString(node).replace(/\s+/g, ' ').trim()
        if (!text) return
        const id = slugger.slug(text)
        node.data = node.data ?? {}
        node.data.hProperties = { ...(node.data.hProperties ?? {}), id }
        toc.push({ id, depth: node.depth, text })
      })

      visit(tree, 'code', (node) => {
        codeMeta.push({
          index: codeMeta.length,
          language: node.lang ?? '',
          filename: null,
          highlightedLines: [],
          collapsed: false,
          diff: false
        })
      })
    })
    .use(remarkRehype)
    .use(rehypeHighlight)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeStringify)
    .process(markdown)

  const words = plainTextSearchBody.split(/\s+/).filter(Boolean)
  const excerpt = plainTextSearchBody.length <= 160
    ? plainTextSearchBody
    : `${plainTextSearchBody.slice(0, 160).trimEnd()}...`

  return {
    html: String(file),
    toc,
    excerpt,
    readingTime: plainTextSearchBody ? Math.max(1, Math.ceil(words.length / 200)) : 0,
    plainTextSearchBody,
    codeMeta,
    processorVersion: PROCESSOR_VERSION
  }
}

function ms(iso) {
  return new Date(iso).getTime()
}

const categories = [
  { id: 'seed-cat-engineering', name: '工程', slug: 'engineering', description: '架构、性能与基础设施', color: '#2563eb', sortOrder: 10 },
  { id: 'seed-cat-notes', name: '随笔', slug: 'notes', description: '日常记录与观察', color: '#059669', sortOrder: 20 },
  { id: 'seed-cat-product', name: '产品', slug: 'product', description: '产品思考与交互', color: '#d97706', sortOrder: 30 }
]

const tags = [
  { id: 'seed-tag-nuxt', name: 'Nuxt', slug: 'nuxt', description: 'Nuxt 3 / Nitro', color: '#00dc82', sortOrder: 10 },
  { id: 'seed-tag-cloudflare', name: 'Cloudflare', slug: 'cloudflare', description: 'Workers / D1 / KV', color: '#f6821f', sortOrder: 20 },
  { id: 'seed-tag-typescript', name: 'TypeScript', slug: 'typescript', description: '类型系统与工程实践', color: '#3178c6', sortOrder: 30 },
  { id: 'seed-tag-d1', name: 'D1', slug: 'd1', description: 'SQLite on the edge', color: '#0ea5e9', sortOrder: 40 },
  { id: 'seed-tag-vue', name: 'Vue', slug: 'vue', description: 'Vue 3 与 Composition API', color: '#42b883', sortOrder: 50 },
  { id: 'seed-tag-performance', name: 'Performance', slug: 'performance', description: '加载与查询优化', color: '#ef4444', sortOrder: 60 },
  { id: 'seed-tag-design', name: 'Design', slug: 'design', description: '界面与信息架构', color: '#a855f7', sortOrder: 70 }
]

/** Exactly 25 published articles so admin/public lists exercise the default page size (25). */
const PUBLISHED_ARTICLE_COUNT = 25

const categoryPool = ['seed-cat-engineering', 'seed-cat-notes', 'seed-cat-product']
const tagPool = [
  'seed-tag-nuxt',
  'seed-tag-cloudflare',
  'seed-tag-typescript',
  'seed-tag-d1',
  'seed-tag-vue',
  'seed-tag-performance',
  'seed-tag-design'
]

const articleTopics = [
  'D1 分页窗口与 COUNT',
  'SSR Payload 复用',
  'useAsyncData 固定 key',
  '评论审核状态机',
  '标签 EXISTS 筛选',
  'Workers 查询预算',
  'Markdown TOC 提取',
  '仓储与领域错误',
  '首页 rail 卡片',
  'Nuxt 中间件鉴权',
  'Cloudflare KV 缓存',
  'TypeScript 边界',
  '后台批量操作',
  '会话 cookie 转发',
  'settings 域修订号',
  '搜索同步失败隔离',
  '精选文章排序',
  '分类未分类回退',
  '公开首页排序',
  '归档按月分组',
  'Turnstile 防护',
  '媒体外链封面',
  'SEO canonical',
  'RSS 与 sitemap',
  '本地调试清单'
]

/**
 * @param {number} index 1-based
 */
function buildPublishedArticle(index) {
  const n = String(index).padStart(2, '0')
  const topic = articleTopics[(index - 1) % articleTopics.length]
  const categoryId = categoryPool[(index - 1) % categoryPool.length]
  const tagIds = [
    tagPool[(index - 1) % tagPool.length],
    tagPool[(index + 2) % tagPool.length]
  ].filter((id, i, arr) => arr.indexOf(id) === i)
  // Spread publish times so newest-first order is stable and obvious in the UI.
  const day = 1 + ((index - 1) % 28)
  const month = index <= 14 ? 6 : 7
  const publishedAt = `2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(8 + (index % 10)).padStart(2, '0')}:00:00.000Z`
  const featured = index <= 2

  return {
    id: `seed-post-${n}`,
    type: /** @type {const} */ ('article'),
    status: /** @type {const} */ ('published'),
    title: `示例文章 ${n}：${topic}`,
    slug: `sample-article-${n}`,
    categoryId,
    tagIds,
    featured,
    featuredOrder: featured ? index : 0,
    publishedAt,
    updatedAt: publishedAt,
    markdown: `## 示例文章 ${n}

这是用于**分页测试**的第 ${index} / ${PUBLISHED_ARTICLE_COUNT} 篇已发布文章。

### 主题

${topic}

### 说明

- 后台默认每页 25 条；本种子共 **${PUBLISHED_ARTICLE_COUNT}** 篇已发布文章
- 加上 About 与草稿后，管理端总条数会超过一页，便于点「下一页」
- 分类 / 标签轮转分配，可测 status、search、tag 筛选

\`\`\`ts
// page window for this seed
listPosts({ offset: 0, limit: 25 })
listPosts({ offset: 25, limit: 25 })
\`\`\`
`,
    customExcerpt: `分页测试样本 ${n} — ${topic}`
  }
}

/** @type {Array<{
 *  id: string
 *  type: 'article' | 'page'
 *  status: 'draft' | 'published'
 *  title: string
 *  slug: string
 *  categoryId: string | null
 *  tagIds: string[]
 *  featured?: boolean
 *  featuredOrder?: number
 *  publishedAt: string | null
 *  updatedAt: string
 *  markdown: string
 *  customExcerpt?: string | null
 * }>} */
const posts = [
  {
    id: 'seed-post-about',
    type: 'page',
    status: 'published',
    title: '关于',
    slug: 'about',
    categoryId: null,
    tagIds: [],
    publishedAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-07-01T10:00:00.000Z',
    markdown: `# 关于 TBLOG

这是一份本地开发用的 About 页面。

## 这个站点

TBLOG 是部署在 Cloudflare Workers 上的全栈博客，使用 Nuxt 3、D1 与 Drizzle。

## 联系

- 本地管理员账号：\`admin\`（以你在 setup 时设置的密码为准）
- 本页用于验证 \`slug=about\` 的单页加载路径。
`,
    customExcerpt: '关于本站与本地开发说明。'
  },
  ...Array.from({ length: PUBLISHED_ARTICLE_COUNT }, (_, i) => buildPublishedArticle(i + 1)),
  {
    id: 'seed-post-draft-roadmap',
    type: 'article',
    status: 'draft',
    title: '（草稿）下季度内容路线图',
    slug: 'draft-content-roadmap',
    categoryId: 'seed-cat-product',
    tagIds: ['seed-tag-design'],
    publishedAt: null,
    updatedAt: '2026-07-10T08:00:00.000Z',
    markdown: `## 未发布

这篇草稿用于后台列表的 status 筛选验证，前台不应出现。
`
  },
  {
    id: 'seed-post-draft-refactor',
    type: 'article',
    status: 'draft',
    title: '（草稿）评论表索引复盘',
    slug: 'draft-comment-index-notes',
    categoryId: 'seed-cat-engineering',
    tagIds: ['seed-tag-d1', 'seed-tag-performance'],
    publishedAt: null,
    updatedAt: '2026-07-12T08:00:00.000Z',
    markdown: `## 笔记

记录评论索引设计取舍，仍为草稿。
`
  }
]

/** @type {Array<{
 *  id: string
 *  postId: string
 *  nickname: string
 *  email: string | null
 *  content: string
 *  status: 'pending' | 'approved' | 'rejected'
 *  parentCommentId?: string | null
 *  replyToNickname?: string | null
 *  createdAt: string
 *  reviewedAt?: string | null
 * }>} */
const comments = [
  {
    id: 'seed-cmt-1',
    postId: 'seed-post-01',
    nickname: '小陈',
    email: 'chen@example.com',
    content: '本地环境跑起来了，首页列表看起来正常！',
    status: 'approved',
    createdAt: '2026-06-03T10:00:00.000Z',
    reviewedAt: '2026-06-03T12:00:00.000Z'
  },
  {
    id: 'seed-cmt-1-reply',
    postId: 'seed-post-01',
    nickname: '站长',
    email: 'admin@example.com',
    content: '谢谢反馈，欢迎继续试用后台分页。',
    status: 'approved',
    parentCommentId: 'seed-cmt-1',
    replyToNickname: '小陈',
    createdAt: '2026-06-03T13:00:00.000Z',
    reviewedAt: '2026-06-03T13:00:00.000Z'
  },
  {
    id: 'seed-cmt-2',
    postId: 'seed-post-02',
    nickname: 'EdgeDev',
    email: 'edge@example.com',
    content: 'COUNT + page 两条 SQL 的设计很清晰，有考虑 keyset 分页吗？',
    status: 'approved',
    createdAt: '2026-06-10T09:30:00.000Z',
    reviewedAt: '2026-06-10T11:00:00.000Z'
  },
  {
    id: 'seed-cmt-3',
    postId: 'seed-post-03',
    nickname: 'VueFan',
    email: null,
    content: 'useAsyncData 的 key 设计有推荐规范吗？',
    status: 'pending',
    createdAt: '2026-07-15T08:00:00.000Z',
    reviewedAt: null
  },
  {
    id: 'seed-cmt-4',
    postId: 'seed-post-04',
    nickname: 'SpamBot',
    email: 'spam@example.com',
    content: '买粉丝加微信 xxxxx',
    status: 'rejected',
    createdAt: '2026-06-20T04:00:00.000Z',
    reviewedAt: '2026-06-20T05:00:00.000Z'
  },
  {
    id: 'seed-cmt-5',
    postId: 'seed-post-07',
    nickname: 'Reader',
    email: 'reader@example.com',
    content: 'TOC 提取很有用，希望支持 h4。',
    status: 'pending',
    createdAt: '2026-07-18T16:40:00.000Z',
    reviewedAt: null
  },
  {
    id: 'seed-cmt-6',
    postId: 'seed-post-06',
    nickname: 'Ops',
    email: 'ops@example.com',
    content: '免费计划下把 N+1 打掉收益很大。',
    status: 'approved',
    createdAt: '2026-07-07T12:00:00.000Z',
    reviewedAt: '2026-07-07T12:30:00.000Z'
  },
  {
    id: 'seed-cmt-7',
    postId: 'seed-post-09',
    nickname: '设计师阿可',
    email: 'ake@example.com',
    content: '侧栏卡片密度可以再调一档吗？',
    status: 'pending',
    createdAt: '2026-07-20T09:15:00.000Z',
    reviewedAt: null
  }
]

async function main() {
  const dbPath = findLocalD1Path()
  console.log(`[seed-local-content] database: ${dbPath}`)

  const sqlite = new Database(dbPath)
  sqlite.pragma('foreign_keys = ON')

  const admin = sqlite.prepare('SELECT id, username FROM administrators ORDER BY created_at ASC LIMIT 1').get()
  if (!admin?.id) {
    sqlite.close()
    throw new Error('No administrator found. Complete /admin/setup first, then re-run this seed.')
  }
  console.log(`[seed-local-content] author: ${admin.username} (${admin.id})`)

  const wipe = sqlite.transaction(() => {
    sqlite.exec(`
      DELETE FROM comments WHERE id LIKE 'seed-%';
      DELETE FROM post_tags WHERE post_id LIKE 'seed-%';
      DELETE FROM post_metadata WHERE post_id LIKE 'seed-%';
      DELETE FROM post_content WHERE post_id LIKE 'seed-%';
      DELETE FROM posts WHERE id LIKE 'seed-%' OR slug = 'about';
      DELETE FROM tags WHERE id LIKE 'seed-%';
      DELETE FROM categories WHERE id LIKE 'seed-%';
    `)
  })
  wipe()

  const insertCategory = sqlite.prepare(`
    INSERT INTO categories (id, name, slug, description, color, sort_order, is_system, created_at, updated_at)
    VALUES (@id, @name, @slug, @description, @color, @sortOrder, 0, @now, @now)
  `)
  const insertTag = sqlite.prepare(`
    INSERT INTO tags (id, name, slug, description, color, sort_order, created_at, updated_at)
    VALUES (@id, @name, @slug, @description, @color, @sortOrder, @now, @now)
  `)
  const insertPost = sqlite.prepare(`
    INSERT INTO posts (
      id, type, status, title, slug, author_id, category_id, cover,
      is_featured, featured_order, published_at, created_at, updated_at
    ) VALUES (
      @id, @type, @status, @title, @slug, @authorId, @categoryId, NULL,
      @isFeatured, @featuredOrder, @publishedAt, @createdAt, @updatedAt
    )
  `)
  const insertContent = sqlite.prepare(`
    INSERT INTO post_content (
      post_id, markdown, html, toc_json, custom_excerpt, excerpt, reading_time,
      plain_text_search_body, code_meta_json, processor_version, processing_state,
      processing_error, processed_at
    ) VALUES (
      @postId, @markdown, @html, @tocJson, @customExcerpt, @excerpt, @readingTime,
      @plainTextSearchBody, @codeMetaJson, @processorVersion, 'processed',
      NULL, @processedAt
    )
  `)
  const insertPostTag = sqlite.prepare(`
    INSERT INTO post_tags (post_id, tag_id) VALUES (@postId, @tagId)
  `)
  const insertComment = sqlite.prepare(`
    INSERT INTO comments (
      id, post_id, nickname, email, content, parent_comment_id, reply_to_nickname,
      status, created_at, reviewed_at
    ) VALUES (
      @id, @postId, @nickname, @email, @content, @parentCommentId, @replyToNickname,
      @status, @createdAt, @reviewedAt
    )
  `)

  const now = Date.now()
  const seed = sqlite.transaction(() => {
    for (const category of categories) {
      insertCategory.run({ ...category, now })
    }
    for (const tag of tags) {
      insertTag.run({ ...tag, now })
    }
  })
  seed()

  for (const post of posts) {
    const processed = await processMarkdown(post.markdown)
    const createdAt = post.publishedAt ? ms(post.publishedAt) : ms(post.updatedAt)
    const publishedAt = post.publishedAt ? ms(post.publishedAt) : null
    const updatedAt = ms(post.updatedAt)

    insertPost.run({
      id: post.id,
      type: post.type,
      status: post.status,
      title: post.title,
      slug: post.slug,
      authorId: admin.id,
      categoryId: post.categoryId,
      isFeatured: post.featured ? 1 : 0,
      featuredOrder: post.featuredOrder ?? 0,
      publishedAt,
      createdAt,
      updatedAt
    })

    insertContent.run({
      postId: post.id,
      markdown: post.markdown,
      html: processed.html,
      tocJson: JSON.stringify(processed.toc ?? []),
      customExcerpt: post.customExcerpt ?? null,
      excerpt: processed.excerpt,
      readingTime: processed.readingTime,
      plainTextSearchBody: processed.plainTextSearchBody,
      codeMetaJson: JSON.stringify(processed.codeMeta ?? []),
      processorVersion: processed.processorVersion,
      processedAt: updatedAt
    })

    for (const tagId of post.tagIds) {
      insertPostTag.run({ postId: post.id, tagId })
    }
  }

  const insertComments = sqlite.transaction(() => {
    for (const comment of comments) {
      insertComment.run({
        id: comment.id,
        postId: comment.postId,
        nickname: comment.nickname,
        email: comment.email,
        content: comment.content,
        parentCommentId: comment.parentCommentId ?? null,
        replyToNickname: comment.replyToNickname ?? null,
        status: comment.status,
        createdAt: ms(comment.createdAt),
        reviewedAt: comment.reviewedAt ? ms(comment.reviewedAt) : null
      })
    }
  })
  insertComments()

  const summary = {
    categories: sqlite.prepare(`SELECT count(*) AS n FROM categories WHERE id LIKE 'seed-%'`).get().n,
    tags: sqlite.prepare(`SELECT count(*) AS n FROM tags WHERE id LIKE 'seed-%'`).get().n,
    posts: sqlite.prepare(`SELECT count(*) AS n FROM posts WHERE id LIKE 'seed-%'`).get().n,
    publishedArticles: sqlite.prepare(
      `SELECT count(*) AS n FROM posts WHERE id LIKE 'seed-%' AND type = 'article' AND status = 'published'`
    ).get().n,
    drafts: sqlite.prepare(
      `SELECT count(*) AS n FROM posts WHERE id LIKE 'seed-%' AND status = 'draft'`
    ).get().n,
    about: sqlite.prepare(`SELECT count(*) AS n FROM posts WHERE slug = 'about'`).get().n,
    comments: sqlite.prepare(`SELECT count(*) AS n FROM comments WHERE id LIKE 'seed-%'`).get().n,
    pendingComments: sqlite.prepare(
      `SELECT count(*) AS n FROM comments WHERE id LIKE 'seed-%' AND status = 'pending'`
    ).get().n
  }

  sqlite.close()

  console.log('[seed-local-content] done')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('[seed-local-content] failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
