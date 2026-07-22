import { commentError } from '../../../server/domain/comment-errors'
import type { CommentProtectionProvider } from '../../../server/providers/comment-protection/comment-protection-provider'
import type {
  AdminCommentPage,
  AdminCommentQuery,
  AutoModerationComment,
  CommentPostTarget,
  CommentRepository,
  CreateCommentModerationResultRecord,
  CreateCommentRecord,
  PublicComment,
  PublicCommentPage,
  PublicCommentQuery
} from '../../../server/repositories/contracts/comment-repositories'
import {
  createCommentService,
  type CommentSecurityEvent
} from '../../../server/services/comment-service'
import type { Permission } from '../../../server/services/permissions'
import type { SettingsRepository } from '../../../server/repositories/contracts/settings-repositories'
import { settingsDefaults } from '../../../server/domain/settings'
import type {
  CommentModerationInput,
  CommentModerationProvider,
  CommentModerationResult
} from '../../../server/providers/comment-moderation/comment-moderation-provider'
import { createMemoryCommentRateLimiter } from '../../../server/services/comment-rate-limiter'
import type { CommentReplicaEvent, CommentReplicaProvider } from '../../../server/providers/comment-replica/comment-replica-provider'

const publishedArticle: CommentPostTarget = {
  id: 'post-1',
  slug: 'published-article',
  title: 'Published article'
}

const publicComments: PublicComment[] = [
  {
    id: 'comment-1',
    parentCommentId: null,
    replyToNickname: null,
    nickname: 'Reader',
    content: 'A public comment',
    createdAt: new Date('2026-07-01T00:00:00.000Z')
  }
]

const adminPage: AdminCommentPage = {
  items: [
    {
      ...publicComments[0],
      email: 'reader@example.com',
      status: 'pending',
      reviewedAt: null,
      post: publishedArticle
    }
  ],
  total: 1,
  offset: 0,
  limit: 20
}

class FakeCommentRepository implements CommentRepository {
  target: CommentPostTarget | null = publishedArticle
  publicResult: PublicCommentPage = { items: publicComments, nextCursor: null }
  adminResult: AdminCommentPage = adminPage
  autoModerationResult: AutoModerationComment[] = adminPage.items.map(({ id, nickname, content, status, post }) => ({
    id, nickname, content, status, post
  }))
  pendingCount = 3
  updateResult = true
  deleteResult = true
  createResult = true
  parentResult: { id: string, postId: string, parentCommentId: string | null, nickname: string, status: 'pending' | 'approved' | 'rejected' } | null = null
  replicaSource = null as null | { id: string, postId: string, parentCommentId: string | null, replyToNickname: string | null, nickname: string, content: string, status: 'pending' | 'approved' | 'rejected', createdAt: Date, reviewedAt: Date | null }
  replicaDeletionSources: Array<NonNullable<FakeCommentRepository['replicaSource']>> = []
  replicaRevision: number | null = null
  enqueueReplicaThrows = false
  calls = {
    findPublishedArticleBySlug: [] as string[],
    createComment: [] as CreateCommentRecord[],
    saveModerationResult: [] as CreateCommentModerationResultRecord[],
    listApprovedByPostId: [] as Array<{ postId: string, query: PublicCommentQuery }>,
    listAdminComments: [] as AdminCommentQuery[],
    findCommentsForAutoModeration: [] as string[][],
    countPendingComments: 0,
    updateStatus: [] as Array<{ id: string; status: 'approved' | 'rejected'; reviewedAt: Date }>,
    deleteComment: [] as string[],
    purgeExpiredModerationResults: [] as Date[],
    enqueueReplicaFailure: [] as unknown[],
    clearReplicaFailure: [] as unknown[]
  }

  async findPublishedArticleBySlug(slug: string) {
    this.calls.findPublishedArticleBySlug.push(slug)
    return this.target
  }

  async createComment(input: CreateCommentRecord) {
    this.calls.createComment.push(input)
    return this.createResult
  }

  async findCommentParent() { return this.parentResult }
  async findCommentReplicaSource() { return this.replicaSource }
  async listReplicaSourcesForDeletion() { return this.replicaDeletionSources }
  async getReplicaFailureRevision() { return this.replicaRevision }
  async clearReplicaFailure(providerKey: string, commentId: string, revision: number) {
    this.calls.clearReplicaFailure.push({ providerKey, commentId, revision })
  }
  async enqueueReplicaFailure(input: unknown) {
    this.calls.enqueueReplicaFailure.push(input)
    if (this.enqueueReplicaThrows) throw new Error('outbox unavailable')
  }

  async saveModerationResult(input: CreateCommentModerationResultRecord) {
    this.calls.saveModerationResult.push(input)
  }

  async listApprovedByPostId(postId: string, query: PublicCommentQuery) {
    this.calls.listApprovedByPostId.push({ postId, query })
    return this.publicResult
  }

  async listAdminComments(query: AdminCommentQuery) {
    this.calls.listAdminComments.push(query)
    return this.adminResult
  }

  async countPendingComments() {
    this.calls.countPendingComments += 1
    return this.pendingCount
  }

  async updateStatus(id: string, status: 'approved' | 'rejected', reviewedAt: Date) {
    this.calls.updateStatus.push({ id, status, reviewedAt })
    return this.updateResult
  }

  async deleteComment(id: string) {
    this.calls.deleteComment.push(id)
    return this.deleteResult
  }

  async findCommentsForAutoModeration(ids: string[]) {
    this.calls.findCommentsForAutoModeration.push(ids)
    return this.autoModerationResult.filter((comment) => ids.includes(comment.id))
  }

  async purgeExpiredModerationResults(now: Date) {
    this.calls.purgeExpiredModerationResults.push(now)
    return 2
  }
}

class FakeCommentProtectionProvider implements CommentProtectionProvider {
  calls: Array<{ token?: string; remoteIp?: string; expectedHostname?: string }> = []
  rejection: Error | null = null

  async verify(input: { token?: string; remoteIp?: string; expectedHostname?: string }) {
    this.calls.push(input)

    if (this.rejection) {
      throw this.rejection
    }
  }
}

class FakeCommentModerationProvider implements CommentModerationProvider {
  calls: CommentModerationInput[] = []
  failure: Error | null = null
  result: CommentModerationResult = {
    decision: 'allow',
    confidence: 0.98,
    categories: [],
    reasons: [],
    providerRequestId: 'request-1',
    modelVersion: 'model-1'
  }
  handler: ((input: CommentModerationInput) => CommentModerationResult | Promise<CommentModerationResult>) | null = null

  async moderate(input: CommentModerationInput) {
    this.calls.push(input)
    if (this.handler) return this.handler(input)
    if (this.failure) throw this.failure
    return this.result
  }
}

class FakeCommentReplicaProvider implements CommentReplicaProvider {
  providerKey = 'http'
  calls: CommentReplicaEvent[] = []
  failure: Error | null = null
  async replicate(event: CommentReplicaEvent) {
    this.calls.push(event)
    if (this.failure) throw this.failure
  }
}

function createTestService(commentEnabled?: boolean, autoModerationEnabled = false) {
  const repository = new FakeCommentRepository()
  const protection = new FakeCommentProtectionProvider()
  const moderation = new FakeCommentModerationProvider()
  const replica = new FakeCommentReplicaProvider()
  const securityEvents: CommentSecurityEvent[] = []
  const now = new Date('2026-07-10T03:04:05.000Z')
  const settingsRepository: SettingsRepository | undefined = commentEnabled === undefined
    ? undefined
    : {
        async getDomain(domain) {
          return (domain === 'comment'
            ? { ...settingsDefaults.comment, enabled: commentEnabled, autoModerationEnabled }
            : settingsDefaults[domain]) as never
        },
        async getProfileSnapshot() { return { value: settingsDefaults.profile, revision: null } },
        async saveDomain() {},
        async saveProfileIfRevision() { return null }
      }
  const service = createCommentService({
    commentRepository: repository,
    commentProtectionProvider: protection,
    commentModerationProvider: moderation,
    commentReplicaProvider: replica,
    settingsRepository,
    securityLogger: event => securityEvents.push(event),
    now: () => now,
    generateId: () => 'comment-new'
  })

  return { service, repository, protection, moderation, replica, securityEvents, now }
}

async function expectError(
  operation: Promise<unknown>,
  expected: { code: string; message: string; statusCode: number }
) {
  await expect(operation).rejects.toMatchObject(expected)
}

describe('comment service', () => {
  it.each([
    ['listPublic', ({ service }: ReturnType<typeof createTestService>) => service.listPublic('hidden')],
    [
      'submit',
      ({ service }: ReturnType<typeof createTestService>) =>
        service.submit('hidden', {
          nickname: 'Reader',
          content: 'Hello',
          protectionToken: 'token-1'
        })
    ]
  ])('returns the same public not-found error when %s cannot find an eligible target', async (_, run) => {
    const context = createTestService()
    context.repository.target = null

    await expectError(run(context), {
      code: 'not_found',
      message: 'Post not found',
      statusCode: 404
    })
    expect(context.repository.calls.findPublishedArticleBySlug).toEqual(['hidden'])
  })

  it('lists the repository public projection without email addresses', async () => {
    const { service, repository } = createTestService()

    const result = await service.listPublic('published-article')

    expect(result).toEqual({ items: [{ id: 'comment-1', nickname: 'Reader', content: 'A public comment', createdAt: publicComments[0]!.createdAt, replies: [] }], nextCursor: null })
    expect(repository.calls.findPublishedArticleBySlug).toEqual(['published-article'])
    expect(repository.calls.listApprovedByPostId).toEqual([{ postId: 'post-1', query: { limit: 20 } }])
    expect(result).not.toHaveProperty('items.0.email')
  })

  it('verifies protection and creates an exact pending comment record', async () => {
    const { service, repository, protection, now } = createTestService()

    await expect(
      service.submit('published-article', {
        nickname: 'Reader',
        email: 'reader@example.com',
        content: 'Hello there',
        protectionToken: 'opaque',
        remoteIp: '203.0.113.10',
        expectedHostname: 'blog.example.com'
      })
    ).resolves.toEqual({ id: 'comment-new', status: 'pending' })
    expect(protection.calls).toEqual([{
      token: 'opaque',
      remoteIp: '203.0.113.10',
      expectedHostname: 'blog.example.com'
    }])
    expect(repository.calls.createComment).toEqual([
      {
        id: 'comment-new',
        postId: 'post-1',
        nickname: 'Reader',
        email: 'reader@example.com',
        content: 'Hello there',
        parentCommentId: null,
        replyTargetId: null,
        status: 'pending',
        createdAt: now,
        reviewedAt: null
      }
    ])
  })

  it('stores an omitted email as null', async () => {
    const { service, repository } = createTestService()

    await service.submit('published-article', { nickname: 'Reader', content: 'Hello' })

    expect(repository.calls.createComment[0]?.email).toBeNull()
  })

  it('flattens reply-to-reply targets to one public reply level', async () => {
    const { service, repository } = createTestService()
    let lookup = 0
    repository.findCommentParent = async () => (++lookup === 1
      ? { id: 'reply-1', postId: 'post-1', parentCommentId: 'comment-1', nickname: 'Reply target', status: 'approved' }
      : { id: 'comment-1', postId: 'post-1', parentCommentId: null, nickname: 'Root target', status: 'approved' })
    await service.submit('published-article', { nickname: 'Reader', content: 'Nested reply', parentCommentId: 'reply-1' })
    expect(repository.calls.createComment[0]).toMatchObject({ parentCommentId: 'comment-1', replyTargetId: 'reply-1' })
  })

  it('rejects a reply when the parent stops qualifying during the atomic insert', async () => {
    const { service, repository } = createTestService()
    repository.parentResult = { id: 'comment-1', postId: 'post-1', parentCommentId: null, nickname: 'Root target', status: 'approved' }
    repository.createResult = false
    await expect(service.submit('published-article', { nickname: 'Reader', content: 'Late reply', parentCommentId: 'comment-1' }))
      .rejects.toMatchObject({ code: 'parent_not_found', statusCode: 404 })
  })

  it('rejects reserved site identities after NFKC normalization', async () => {
    const { service } = createTestService(true)
    await expect(service.submit('published-article', { nickname: 'ＡＤＭＩＮ', content: 'Impersonation' }))
      .rejects.toMatchObject({ code: 'validation_failed', statusCode: 422 })
  })

  it('keeps D1 submission successful and records a public-safe replica failure', async () => {
    const { service, repository, replica, now } = createTestService()
    repository.replicaSource = { id: 'comment-new', postId: 'post-1', parentCommentId: null, replyToNickname: null, nickname: 'Reader', content: 'Hello', status: 'pending', createdAt: now, reviewedAt: null }
    replica.failure = new Error('offline')
    await expect(service.submit('published-article', { nickname: 'Reader', content: 'Hello' }))
      .resolves.toEqual({ id: 'comment-new', status: 'pending' })
    expect(repository.calls.enqueueReplicaFailure).toHaveLength(1)
    expect(JSON.stringify(repository.calls.enqueueReplicaFailure[0])).not.toContain('email')
  })

  it('does not expose an outbox failure after the core D1 comment succeeds', async () => {
    const { service, repository, replica, now } = createTestService()
    repository.replicaSource = { id: 'comment-new', postId: 'post-1', parentCommentId: null, replyToNickname: null, nickname: 'Reader', content: 'Hello', status: 'pending', createdAt: now, reviewedAt: null }
    repository.enqueueReplicaThrows = true
    replica.failure = new Error('offline')
    await expect(service.submit('published-article', { nickname: 'Reader', content: 'Hello' }))
      .resolves.toEqual({ id: 'comment-new', status: 'pending' })
  })

  it('clears only the captured stale replica revision after a successful live sync', async () => {
    const { service, repository, now } = createTestService()
    repository.replicaRevision = 4
    repository.replicaSource = { id: 'comment-new', postId: 'post-1', parentCommentId: null, replyToNickname: null, nickname: 'Reader', content: 'Hello', status: 'pending', createdAt: now, reviewedAt: null }
    await service.submit('published-article', { nickname: 'Reader', content: 'Hello' })
    expect(repository.calls.clearReplicaFailure).toEqual([{ providerKey: 'http', commentId: 'comment-new', revision: 4 }])
  })

  it('rejects nicknames whose NFKC expansion exceeds the stored limit', async () => {
    const { service } = createTestService()
    await expect(service.submit('published-article', { nickname: '\uFDFA'.repeat(20), content: 'Hello' }))
      .rejects.toMatchObject({ code: 'validation_failed', statusCode: 422 })
  })

  it('approves an allowed comment directly when automatic moderation is enabled', async () => {
    const { service, repository, moderation, now } = createTestService(true, true)

    await expect(
      service.submit('published-article', { nickname: 'Reader', content: 'Hello' })
    ).resolves.toEqual({ id: 'comment-new', status: 'approved' })

    expect(moderation.calls).toEqual([
      {
        nickname: 'Reader',
        content: 'Hello',
        locale: 'zh-CN',
        post: { id: 'post-1', title: 'Published article' }
      }
    ])
    expect(repository.calls.createComment[0]).toMatchObject({
      status: 'approved',
      reviewedAt: now
    })
  })

  it('stores a rejected automatic decision without creating a pending comment', async () => {
    const { service, repository, moderation, now } = createTestService(true, true)
    moderation.result = { ...moderation.result, decision: 'reject', reasons: ['spam'] }

    await expect(
      service.submit('published-article', { nickname: 'Spammer', content: 'Buy now' })
    ).resolves.toEqual({ id: 'comment-new', status: 'rejected' })

    expect(repository.calls.createComment).toHaveLength(1)
    expect(repository.calls.createComment[0]).toMatchObject({ status: 'rejected', reviewedAt: now })
    expect(repository.calls.createComment.some((comment) => comment.status === 'pending')).toBe(false)
  })

  it('falls back to a pending manual-review comment when the automatic moderation provider fails', async () => {
    const { service, repository, moderation, securityEvents } = createTestService(true, true)
    moderation.failure = new Error('provider details must not escape')

    await expect(
      service.submit('published-article', { nickname: 'Reader', content: 'Hello' })
    ).resolves.toEqual({ id: 'comment-new', status: 'pending' })
    expect(repository.calls.createComment).toHaveLength(1)
    expect(repository.calls.createComment[0]).toMatchObject({ status: 'pending', reviewedAt: null })
    expect(repository.calls.saveModerationResult).toEqual([])
    expect(securityEvents).toContainEqual(expect.objectContaining({
      event: 'comment_moderation_fallback',
      postId: 'post-1'
    }))
  })

  it('keeps a low-confidence automatic decision pending and stores its audit result', async () => {
    const { service, repository, moderation, securityEvents } = createTestService(true, true)
    moderation.result = { ...moderation.result, confidence: 0.89 }

    await expect(service.submit('published-article', { nickname: 'Reader', content: 'Uncertain' }))
      .resolves.toEqual({ id: 'comment-new', status: 'pending' })
    expect(repository.calls.createComment[0]).toMatchObject({ status: 'pending', reviewedAt: null })
    expect(repository.calls.saveModerationResult).toHaveLength(1)
    expect(securityEvents).toContainEqual(expect.objectContaining({
      event: 'comment_moderation_review_required',
      commentId: 'comment-new'
    }))
  })

  it('keeps a provider-deferred allow decision pending for manual review', async () => {
    const { service, repository, moderation } = createTestService(true, true)
    moderation.result = { ...moderation.result, decision: 'allow', confidence: null }

    await expect(service.submit('published-article', {
      nickname: 'Promoter',
      content: 'Visit my unrelated promotion'
    })).resolves.toEqual({ id: 'comment-new', status: 'pending' })
    expect(repository.calls.createComment[0]).toMatchObject({ status: 'pending', reviewedAt: null })
    expect(repository.calls.saveModerationResult).toHaveLength(1)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    'keeps a non-finite confidence decision pending: %s',
    async (confidence) => {
      const { service, repository, moderation } = createTestService(true, true)
      moderation.result = { ...moderation.result, confidence }

      await expect(service.submit('published-article', { nickname: 'Reader', content: 'Uncertain' }))
        .resolves.toEqual({ id: 'comment-new', status: 'pending' })
      expect(repository.calls.createComment[0]).toMatchObject({ status: 'pending', reviewedAt: null })
    }
  )

  it('normalizes moderated text while preserving the validated stored values', async () => {
    const { service, repository, moderation } = createTestService(true, true)
    const original = 'Ｂ\u200Buy   now'

    await service.submit('published-article', { nickname: 'Reader   Name', content: original })

    expect(moderation.calls[0]?.nickname).toBe('Reader Name')
    expect(moderation.calls[0]?.content).toBe('Buy now')
    expect(repository.calls.createComment[0]?.nickname).toBe('Reader   Name')
    expect(repository.calls.createComment[0]?.content).toBe(original)
  })

  it('rate limits automatic moderation before calling the external provider', async () => {
    const context = createTestService(true, true)
    const limiter = createMemoryCommentRateLimiter()
    const service = createCommentService({
      commentRepository: context.repository,
      commentProtectionProvider: context.protection,
      commentModerationProvider: context.moderation,
      commentRateLimiter: limiter,
      settingsRepository: {
        async getDomain(domain) {
          return (domain === 'comment'
            ? { ...settingsDefaults.comment, enabled: true, autoModerationEnabled: true,
                rateLimit: { windowSeconds: 60, maxPerWindow: 1 } }
            : settingsDefaults[domain]) as never
        },
        async getProfileSnapshot() { return { value: settingsDefaults.profile, revision: null } },
        async saveDomain() {},
        async saveProfileIfRevision() { return null }
      },
      generateId: () => 'comment-new'
    })

    await service.submit('published-article', { nickname: 'Reader', content: 'One', remoteIp: '203.0.113.4' })
    await expect(service.submit('published-article', { nickname: 'Reader', content: 'Two', remoteIp: '203.0.113.4' }))
      .rejects.toMatchObject({
        code: 'rate_limited',
        statusCode: 429,
        details: { retryAfterSeconds: expect.any(Number) }
      })
    expect(context.moderation.calls).toHaveLength(1)
    expect(context.protection.calls).toHaveLength(1)
  })

  it('rate limits the manual pending workflow before protection or D1 writes', async () => {
    const context = createTestService(true, false)
    const service = createCommentService({
      commentRepository: context.repository,
      commentProtectionProvider: context.protection,
      commentModerationProvider: context.moderation,
      commentRateLimiter: createMemoryCommentRateLimiter(),
      settingsRepository: {
        async getDomain(domain) {
          return (domain === 'comment'
            ? { ...settingsDefaults.comment, enabled: true,
                rateLimit: { windowSeconds: 60, maxPerWindow: 1 } }
            : settingsDefaults[domain]) as never
        },
        async getProfileSnapshot() { return { value: settingsDefaults.profile, revision: null } },
        async saveDomain() {},
        async saveProfileIfRevision() { return null }
      },
      generateId: () => 'comment-new'
    })

    await service.submit('published-article', { nickname: 'Reader', content: 'One', remoteIp: '203.0.113.5' })
    await expect(service.submit('published-article', { nickname: 'Reader', content: 'Two', remoteIp: '203.0.113.5' }))
      .rejects.toMatchObject({ code: 'rate_limited', statusCode: 429 })
    expect(context.protection.calls).toHaveLength(1)
    expect(context.repository.calls.createComment).toHaveLength(1)
  })

  it('enforces the comment enabled policy for public reads and submissions', async () => {
    const { service, repository } = createTestService(false)

    await expect(service.listPublic('published-article')).resolves.toEqual({ items: [], nextCursor: null })
    await expect(service.submit('published-article', { nickname: 'Reader', content: 'Hello' }))
      .rejects.toMatchObject({ code: 'comments_disabled', statusCode: 403 })
    expect(repository.calls.createComment).toEqual([])
  })

  it('propagates protection rejection without inserting a comment', async () => {
    const { service, repository, protection } = createTestService()
    const rejection = commentError('protection_rejected', 'Comment verification failed', 422)
    protection.rejection = rejection

    await expect(
      service.submit('published-article', {
        nickname: 'Reader',
        content: 'Hello',
        protectionToken: 'rejected-token'
      })
    ).rejects.toBe(rejection)
    expect(repository.calls.createComment).toEqual([])
  })

  it.each([
    [
      'listAdmin',
      async ({ service }: ReturnType<typeof createTestService>, permissions: Permission[]) =>
        service.listAdmin({ offset: 0, limit: 20 }, permissions)
    ],
    [
      'getCounts',
      async ({ service }: ReturnType<typeof createTestService>, permissions: Permission[]) =>
        service.getCounts(permissions)
    ],
    [
      'moderate',
      async ({ service }: ReturnType<typeof createTestService>, permissions: Permission[]) =>
        service.moderate('comment-1', 'approved', permissions)
    ],
    [
      'remove',
      async ({ service }: ReturnType<typeof createTestService>, permissions: Permission[]) =>
        service.remove('comment-1', permissions)
    ],
    [
      'autoModerate',
      async ({ service }: ReturnType<typeof createTestService>, permissions: Permission[]) =>
        service.autoModerate(['comment-1'], permissions)
    ]
  ])('forbids %s before calling the repository', async (_, run) => {
    const context = createTestService()

    await expectError(run(context, []), {
      code: 'forbidden',
      message: 'Permission denied',
      statusCode: 403
    })
    expect(context.repository.calls).toEqual({
      findPublishedArticleBySlug: [],
      createComment: [],
      saveModerationResult: [],
      listApprovedByPostId: [],
      listAdminComments: [],
      findCommentsForAutoModeration: [],
      countPendingComments: 0,
      updateStatus: [],
      deleteComment: [],
      purgeExpiredModerationResults: [],
      enqueueReplicaFailure: [],
      clearReplicaFailure: []
    })
  })

  it('delegates authorized admin listing', async () => {
    const { service, repository } = createTestService()
    const query: AdminCommentQuery = { status: 'pending', offset: 20, limit: 10 }

    await expect(service.listAdmin(query, ['comment:*'])).resolves.toBe(adminPage)
    expect(repository.calls.listAdminComments).toEqual([query])
  })

  it('returns the authorized pending count', async () => {
    const { service, repository } = createTestService()

    await expect(service.getCounts(['comment:*'])).resolves.toEqual({ pending: 3 })
    expect(repository.calls.countPendingComments).toBe(1)
  })

  it.each(['approved', 'rejected'] as const)(
    'moderates a comment to %s using the injected time',
    async (status) => {
      const { service, repository, now } = createTestService()

      await expect(service.moderate('comment-1', status, ['comment:*'])).resolves.toEqual({
        id: 'comment-1',
        status
      })
      expect(repository.calls.updateStatus).toEqual([{ id: 'comment-1', status, reviewedAt: now }])
    }
  )

  it('returns comment_not_found when moderation updates no record', async () => {
    const { service, repository } = createTestService()
    repository.updateResult = false

    await expectError(service.moderate('missing', 'approved', ['comment:*']), {
      code: 'comment_not_found',
      message: 'Comment not found',
      statusCode: 404
    })
  })

  it('removes an existing comment', async () => {
    const { service, repository } = createTestService()

    await expect(service.remove('comment-1', ['comment:*'])).resolves.toEqual({ id: 'comment-1' })
    expect(repository.calls.deleteComment).toEqual(['comment-1'])
  })

  it('returns comment_not_found when removal deletes no record', async () => {
    const { service, repository } = createTestService()
    repository.deleteResult = false

    await expectError(service.remove('missing', ['comment:*']), {
      code: 'comment_not_found',
      message: 'Comment not found',
      statusCode: 404
    })
  })

  it('replicates removal for a deleted top-level comment and each cascaded reply', async () => {
    const { service, repository, replica, now } = createTestService()
    repository.replicaDeletionSources = [
      { id: 'comment-1', postId: 'post-1', parentCommentId: null, replyToNickname: null, nickname: 'Root', content: 'Root', status: 'approved', createdAt: now, reviewedAt: now },
      { id: 'reply-1', postId: 'post-1', parentCommentId: 'comment-1', replyToNickname: 'Root', nickname: 'Reply', content: 'Reply', status: 'approved', createdAt: now, reviewedAt: now }
    ]
    await service.remove('comment-1', ['comment:*'])
    expect(replica.calls).toEqual([
      { operation: 'remove', commentId: 'comment-1', postId: 'post-1' },
      { operation: 'remove', commentId: 'reply-1', postId: 'post-1' }
    ])
  })

  it('automatically moderates selected comments and returns public-safe per-item results', async () => {
    const { service, repository, moderation, now } = createTestService(true, false)
    repository.autoModerationResult = [
      {
        id: 'comment-1', nickname: 'Reader', content: 'Allow this', status: 'pending', post: publishedArticle
      },
      {
        id: 'comment-2', nickname: 'Spammer', content: 'Reject this', status: 'approved', post: publishedArticle
      }
    ]
    moderation.handler = (input) => input.content.startsWith('Allow')
      ? moderation.result
      : { ...moderation.result, decision: 'reject', reasons: ['spam'] }

    await expect(service.autoModerate(['comment-1', 'comment-2', 'missing'], ['comment:*']))
      .resolves.toEqual({
        results: [
          { id: 'comment-1', outcome: 'approved', status: 'approved' },
          { id: 'comment-2', outcome: 'rejected', status: 'rejected' },
          { id: 'missing', outcome: 'not_found', status: null }
        ],
        summary: { requested: 3, succeeded: 2, failed: 1 }
      })
    expect(repository.calls.findCommentsForAutoModeration).toEqual([
      ['comment-1', 'comment-2', 'missing']
    ])
    expect(repository.calls.updateStatus).toEqual([
      { id: 'comment-1', status: 'approved', reviewedAt: now },
      { id: 'comment-2', status: 'rejected', reviewedAt: now }
    ])
    expect(repository.calls.saveModerationResult).toHaveLength(2)
    expect(moderation.calls.every((call) => !('email' in call))).toBe(true)
  })

  it('keeps the current status when one selected automatic moderation call fails', async () => {
    const { service, repository, moderation } = createTestService(true, false)
    repository.autoModerationResult = [
      {
        id: 'comment-1', nickname: 'Reader', content: 'Provider fails', status: 'pending', post: publishedArticle
      }
    ]
    moderation.failure = new Error('private provider failure')

    await expect(service.autoModerate(['comment-1'], ['comment:*'])).resolves.toEqual({
      results: [{ id: 'comment-1', outcome: 'failed', status: 'pending' }],
      summary: { requested: 1, succeeded: 0, failed: 1 }
    })
    expect(repository.calls.updateStatus).toEqual([])
    expect(repository.calls.saveModerationResult).toEqual([])
  })

  it('keeps the current status when selected automatic moderation has low confidence', async () => {
    const { service, repository, moderation } = createTestService(true, false)
    repository.autoModerationResult = [
      {
        id: 'comment-1', nickname: 'Reader', content: 'Uncertain', status: 'pending', post: publishedArticle
      }
    ]
    moderation.result = { ...moderation.result, confidence: 0.5 }

    await expect(service.autoModerate(['comment-1'], ['comment:*'])).resolves.toEqual({
      results: [{ id: 'comment-1', outcome: 'review_required', status: 'pending' }],
      summary: { requested: 1, succeeded: 0, failed: 1 }
    })
    expect(repository.calls.updateStatus).toEqual([])
    expect(repository.calls.saveModerationResult).toHaveLength(1)
  })

  it('requires maintenance permission to purge moderation audit records', async () => {
    const { service, repository, now } = createTestService()
    await expect(service.purgeExpiredModerationResults(['comment:*'])).rejects.toMatchObject({
      code: 'forbidden', statusCode: 403
    })
    await expect(service.purgeExpiredModerationResults(['maintenance:*'], now)).resolves.toBe(2)
    expect(repository.calls.purgeExpiredModerationResults).toEqual([now])
  })
})
