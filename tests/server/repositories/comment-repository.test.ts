import { createCommentRepository } from '../../../server/repositories/comment-repository'
import { createSqliteTestDatabase } from '../test-utils/sqlite-db'

const OTHER_POST = new Date('2026-07-07T08:00:00.000Z')
const OLDEST = new Date('2026-07-08T08:00:00.000Z')
const TIED = new Date('2026-07-09T08:00:00.000Z')
const NEWEST = new Date('2026-07-10T08:00:00.000Z')

function seed(sqlite: ReturnType<typeof createSqliteTestDatabase>['sqlite']) {
  sqlite.exec(`
    INSERT INTO administrators (id, username, password_hash) VALUES ('admin-1', 'admin', 'hash');

    INSERT INTO posts (id, type, status, title, slug, author_id, published_at) VALUES
      ('post-1', 'article', 'published', 'Published', 'published', 'admin-1', ${OLDEST.getTime()}),
      ('post-2', 'article', 'draft', 'Draft', 'draft', 'admin-1', NULL),
      ('post-3', 'page', 'published', 'About', 'about', 'admin-1', ${OLDEST.getTime()}),
      ('post-4', 'article', 'published', 'Other', 'other', 'admin-1', ${OTHER_POST.getTime()});
  `)

  const insertComment = sqlite.prepare(
    `INSERT INTO comments (id, post_id, nickname, email, content, status, created_at, reviewed_at)
     VALUES (?, 'post-1', ?, ?, ?, ?, ?, ?)`
  )

  insertComment.run('approved-old', 'Old reader', 'old@example.com', 'Old approved', 'approved', OLDEST.getTime(), TIED.getTime())
  insertComment.run('approved-a', 'Reader A', 'a@example.com', 'Approved A', 'approved', TIED.getTime(), NEWEST.getTime())
  insertComment.run('approved-b', 'Reader B', 'b@example.com', 'Approved B', 'approved', TIED.getTime(), NEWEST.getTime())
  insertComment.run('pending-a', 'Pending A', 'pending-a@example.com', 'Pending A', 'pending', NEWEST.getTime(), null)
  insertComment.run('pending-b', 'Pending B', null, 'Pending B', 'pending', NEWEST.getTime(), null)
  insertComment.run('rejected-1', 'Rejected', 'rejected@example.com', 'Rejected', 'rejected', OLDEST.getTime(), TIED.getTime())
  sqlite.prepare(
    `INSERT INTO comments (id, post_id, nickname, email, content, status, created_at, reviewed_at)
     VALUES ('approved-other', 'post-4', 'Other reader', NULL, 'Other approved', 'approved', ?, ?)`
  ).run(OTHER_POST.getTime(), TIED.getTime())
}

function setup() {
  const { db, sqlite } = createSqliteTestDatabase()
  seed(sqlite)
  return { repository: createCommentRepository(db as never), sqlite }
}

describe('comment repository', () => {
  it('finds only published article targets', async () => {
    const { repository } = setup()

    await expect(repository.findPublishedArticleBySlug('published')).resolves.toEqual({
      id: 'post-1',
      slug: 'published',
      title: 'Published'
    })
    await expect(repository.findPublishedArticleBySlug('draft')).resolves.toBeNull()
    await expect(repository.findPublishedArticleBySlug('about')).resolves.toBeNull()
    await expect(repository.findPublishedArticleBySlug('missing')).resolves.toBeNull()
  })

  it('creates comments with the service-selected status and review time', async () => {
    const { repository, sqlite } = setup()

    await repository.createComment({
      id: 'new-comment',
      postId: 'post-1',
      nickname: 'Reader',
      email: 'reader@example.com',
      content: 'New comment',
      status: 'approved',
      createdAt: NEWEST,
      reviewedAt: TIED
    })

    expect(sqlite.prepare('SELECT * FROM comments WHERE id = ?').get('new-comment')).toMatchObject({
      id: 'new-comment',
      post_id: 'post-1',
      nickname: 'Reader',
      email: 'reader@example.com',
      content: 'New comment',
      status: 'approved',
      created_at: NEWEST.getTime(),
      reviewed_at: TIED.getTime()
    })
  })

  it('lists approved comments with a public projection and stable oldest-first order', async () => {
    const { repository } = setup()

    const page = await repository.listApprovedByPostId('post-1', { limit: 20 })
    const items = page.items

    expect(items.map((item) => item.id)).toEqual(['approved-old', 'approved-a', 'approved-b'])
    expect(items.map((item) => item.id)).not.toContain('approved-other')
    expect(items[0]).toEqual({
      id: 'approved-old',
      parentCommentId: null,
      replyToNickname: null,
      nickname: 'Old reader',
      content: 'Old approved',
      createdAt: OLDEST
    })
    // The public projection is an exact whitelist: a future private column (email, and any ip/ua-like
    // field added to the comments table) must fail this rather than silently leak into a public read.
    const publicKeys = ['content', 'createdAt', 'id', 'nickname', 'parentCommentId', 'replyToNickname']
    expect(items.every((item) => Object.keys(item).sort().join(',') === publicKeys.join(','))).toBe(true)
    expect(page.nextCursor).toBeNull()
  })

  it('cursor-paginates top-level approved comments in stable oldest-first order', async () => {
    const { repository } = setup()

    const first = await repository.listApprovedByPostId('post-1', { limit: 2 })
    const second = await repository.listApprovedByPostId('post-1', {
      limit: 2,
      cursor: first.nextCursor!
    })

    expect(first.items.map((item) => item.id)).toEqual(['approved-old', 'approved-a'])
    expect(first.nextCursor).toEqual(expect.any(String))
    expect(second.items.map((item) => item.id)).toEqual(['approved-b'])
    expect(second.nextCursor).toBeNull()
  })

  it('filters and paginates admin comments with an accurate total and post projection', async () => {
    const { repository } = setup()

    const page = await repository.listAdminComments({ status: 'pending', offset: 1, limit: 1 })

    expect(page).toEqual({
      items: [
        {
          id: 'pending-a',
          parentCommentId: null,
          parent: null,
          nickname: 'Pending A',
          email: 'pending-a@example.com',
          content: 'Pending A',
          status: 'pending',
          createdAt: NEWEST,
          reviewedAt: null,
          post: { id: 'post-1', slug: 'published', title: 'Published' }
        }
      ],
      total: 2,
      offset: 1,
      limit: 1
    })
  })

  it('lists all admin comments newest-first when no status filter is provided', async () => {
    const { repository } = setup()

    const page = await repository.listAdminComments({ offset: 0, limit: 10 })

    expect(page.total).toBe(7)
    expect(page.items.map((item) => item.id)).toEqual([
      'pending-b',
      'pending-a',
      'approved-b',
      'approved-a',
      'rejected-1',
      'approved-old',
      'approved-other'
    ])
  })

  it('finds only selected comments for automatic moderation without selecting email', async () => {
    const { repository } = setup()

    const items = await repository.findCommentsForAutoModeration(['pending-a', 'approved-other', 'missing'])

    expect(items).toEqual(expect.arrayContaining([
      {
        id: 'pending-a', parentCommentId: null, nickname: 'Pending A', content: 'Pending A', status: 'pending',
        post: { id: 'post-1', slug: 'published', title: 'Published' }
      },
      {
        id: 'approved-other', parentCommentId: null, nickname: 'Other reader', content: 'Other approved', status: 'approved',
        post: { id: 'post-4', slug: 'other', title: 'Other' }
      }
    ]))
    expect(items).toHaveLength(2)
    expect(items.every((item) => !('email' in item))).toBe(true)
  })

  it('upserts moderation audit results so selected comments can be re-evaluated', async () => {
    const { repository, sqlite } = setup()
    const createdAt = new Date('2026-07-10T10:00:00.000Z')
    const expiresAt = new Date('2026-08-09T10:00:00.000Z')

    await repository.saveModerationResult({
      commentId: 'pending-a', providerKey: 'http', decision: 'allow', confidence: 0.9,
      categories: [], reasons: ['initial'], providerRequestId: 'request-1', modelVersion: 'v1',
      createdAt, expiresAt
    })
    await repository.saveModerationResult({
      commentId: 'pending-a', providerKey: 'http', decision: 'reject', confidence: 0.75,
      categories: ['spam'], reasons: ['retry'], providerRequestId: 'request-2', modelVersion: 'v2',
      createdAt, expiresAt
    })

    expect(sqlite.prepare(
      'SELECT decision, confidence_millis, categories_json, reasons_json, provider_request_id, model_version FROM comment_moderation_results WHERE comment_id = ?'
    ).get('pending-a')).toEqual({
      decision: 'reject', confidence_millis: 750, categories_json: '["spam"]', reasons_json: '["retry"]',
      provider_request_id: 'request-2', model_version: 'v2'
    })
  })

  it('purges up to 250 expired moderation results with one bounded subquery', async () => {
    const { repository, sqlite } = setup()
    const insert = sqlite.prepare(`
      insert into comment_moderation_results
        (comment_id, provider_key, decision, categories_json, reasons_json, created_at, expires_at)
      values (?, 'http', 'allow', '[]', '[]', ?, ?)
    `)
    const insertComment = sqlite.prepare(`
      insert into comments (id, post_id, nickname, content, status, created_at)
      values (?, 'post-1', 'Reader', 'Pending', 'pending', ?)
    `)
    const cutoff = new Date('2026-08-01T00:00:00.000Z')
    for (let index = 0; index < 260; index += 1) {
      const id = `expired-${index}`
      insertComment.run(id, OLDEST.getTime())
      insert.run(id, OLDEST.getTime(), cutoff.getTime() - 1)
    }

    await expect(repository.purgeExpiredModerationResults?.(cutoff)).resolves.toBe(250)
    expect(sqlite.prepare('select count(*) as count from comment_moderation_results').get())
      .toEqual({ count: 10 })
    await expect(repository.purgeExpiredModerationResults?.(cutoff)).resolves.toBe(10)
  })

  it('counts only pending comments', async () => {
    const { repository } = setup()

    await expect(repository.countPendingComments()).resolves.toBe(2)
  })

  it('updates status and review time, returning false for a missing comment', async () => {
    const { repository, sqlite } = setup()
    const reviewedAt = new Date('2026-07-10T09:00:00.000Z')

    await expect(repository.updateStatus('pending-a', 'approved', reviewedAt)).resolves.toBe(true)
    expect(sqlite.prepare('SELECT status, reviewed_at FROM comments WHERE id = ?').get('pending-a')).toEqual({
      status: 'approved',
      reviewed_at: reviewedAt.getTime()
    })
    await expect(repository.updateStatus('missing', 'approved', reviewedAt)).resolves.toBe(false)
  })

  it('hard deletes comments, returning false for a missing comment', async () => {
    const { repository, sqlite } = setup()

    await expect(repository.deleteComment('rejected-1')).resolves.toBe(true)
    expect(sqlite.prepare('SELECT id FROM comments WHERE id = ?').get('rejected-1')).toBeUndefined()
    await expect(repository.deleteComment('missing')).resolves.toBe(false)
  })

  it('atomically inserts replies only while the approved top-level parent still qualifies', async () => {
    const { repository } = setup()
    await expect(repository.createComment({
      id: 'reply-new', postId: 'post-1', parentCommentId: 'approved-old', nickname: 'Reply',
      replyTargetId: 'approved-old', email: null, content: 'Hello', status: 'pending', createdAt: NEWEST, reviewedAt: null
    })).resolves.toBe(true)
    await repository.updateStatus('approved-old', 'rejected', NEWEST)
    await expect(repository.createComment({
      id: 'reply-late', postId: 'post-1', parentCommentId: 'approved-old', nickname: 'Reply',
      replyTargetId: 'approved-old', email: null, content: 'Too late', status: 'pending', createdAt: NEWEST, reviewedAt: null
    })).resolves.toBe(false)
  })

  it('atomically rejects a reply when the specifically selected reply target no longer qualifies', async () => {
    const { repository, sqlite } = setup()
    sqlite.prepare(`INSERT INTO comments (
      id, post_id, parent_comment_id, nickname, content, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      'reply-target', 'post-1', 'approved-old', 'Selected reader', 'Target', 'approved', OLDEST.getTime()
    )

    await expect(repository.createComment({
      id: 'reply-to-reply', postId: 'post-1', parentCommentId: 'approved-old', replyTargetId: 'reply-target', nickname: 'Reply',
      email: null, content: 'Hello', status: 'pending', createdAt: NEWEST, reviewedAt: null
    })).resolves.toBe(true)
    expect(sqlite.prepare('SELECT reply_to_nickname FROM comments WHERE id = ?').get('reply-to-reply'))
      .toEqual({ reply_to_nickname: 'Selected reader' })

    await repository.updateStatus('reply-target', 'rejected', NEWEST)
    await expect(repository.createComment({
      id: 'reply-after-rejection', postId: 'post-1', parentCommentId: 'approved-old', replyTargetId: 'reply-target', nickname: 'Reply',
      email: null, content: 'Too late', status: 'pending', createdAt: NEWEST, reviewedAt: null
    })).resolves.toBe(false)
  })

  it('versions replica failures so stale completion cannot delete a newer desired state', async () => {
    const { repository, sqlite } = setup()
    await repository.enqueueReplicaFailure?.({ providerKey: 'http', commentId: 'approved-old', operation: 'upsert', payloadJson: '{"state":"pending"}', error: 'offline', now: OLDEST })
    await repository.enqueueReplicaFailure?.({ providerKey: 'http', commentId: 'approved-old', operation: 'upsert', payloadJson: '{"state":"approved"}', error: 'offline', now: NEWEST })
    expect(await repository.getReplicaFailureRevision?.('http', 'approved-old')).toBe(2)
    await repository.clearReplicaFailure?.('http', 'approved-old', 1)
    expect(sqlite.prepare('SELECT revision FROM comment_replica_jobs WHERE comment_id = ?').get('approved-old')).toEqual({ revision: 2 })
    await repository.clearReplicaFailure?.('http', 'approved-old', 2)
    expect(sqlite.prepare('SELECT id FROM comment_replica_jobs WHERE comment_id = ?').get('approved-old')).toBeUndefined()
  })
})
