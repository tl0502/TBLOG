import { flushPromises, mount } from '@vue/test-utils'
import { shallowRef, toValue, type MaybeRefOrGetter } from 'vue'
import CommentModerationView from '../../../components/admin/CommentModerationView.vue'
import type { AdminCommentQuery, AdminCommentView } from '../../../composables/useAdminApi'

const api = vi.hoisted(() => ({
  useAdminComments: vi.fn(),
  moderateComment: vi.fn(),
  autoModerateComments: vi.fn(),
  deleteComment: vi.fn(),
  apiErrorMessage: vi.fn((error: unknown, fallback: string) => {
    const message = (error as { data?: { error?: { message?: string } } })?.data?.error?.message
    return message || fallback
  })
}))

vi.mock('~/composables/useAdminApi', () => api)

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>'
}

function commentView(overrides: Partial<AdminCommentView> = {}): AdminCommentView {
  return {
    id: 'comment-1', nickname: 'Reader', email: null, content: 'Comment', status: 'pending',
    createdAt: '2026-07-11T08:00:00.000Z', reviewedAt: null,
    post: { id: 'post-1', slug: 'hello', title: 'Hello' }, ...overrides
  }
}

function setupList(options: { error?: unknown; total?: number; pending?: boolean; rows?: AdminCommentView[] } = {}) {
  let querySource!: MaybeRefOrGetter<AdminCommentQuery>
  const refresh = vi.fn().mockResolvedValue(undefined)
  const data = shallowRef({
    data: options.rows ?? [commentView()],
    meta: { total: options.total ?? 45, offset: 0, limit: 20 }
  })
  api.useAdminComments.mockImplementation((received: typeof querySource) => {
    querySource = received
    return {
      data,
      pending: shallowRef(options.pending ?? false),
      error: shallowRef(options.error ?? null),
      refresh
    }
  })
  return { get query() { return toValue(querySource) }, data, refresh }
}

function mountView() {
  return mount(CommentModerationView, { global: { stubs: { NuxtLink } } })
}

describe('CommentModerationView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('refreshNuxtData', vi.fn().mockResolvedValue(undefined))
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('starts pending at offset zero with limit twenty and resets offset on filter change', async () => {
    const list = setupList()
    const wrapper = mountView()

    expect(list.query).toMatchObject({ status: 'pending', offset: 0, limit: 20 })

    await wrapper.get('[data-test="comment-page-next"]').trigger('click')
    expect(list.query.offset).toBe(20)

    await wrapper.get('[data-test="comment-filter-all"]').trigger('click')
    expect(list.query).toMatchObject({ offset: 0, limit: 20 })
    expect('status' in list.query).toBe(false)
  })

  it('keeps pagination within the total bounds', async () => {
    const list = setupList({ total: 21 })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-page-next"]').trigger('click')
    expect(list.query.offset).toBe(20)
    expect(wrapper.get('[data-test="comment-page-next"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="comment-page-prev"]').trigger('click')
    expect(list.query.offset).toBe(0)
  })

  it('shows a non-blocking synchronization error when rows are already available', () => {
    setupList({ error: { data: { error: { message: 'Comments are unavailable.' } } } })
    const wrapper = mountView()

    expect(wrapper.get('[data-test="comment-sync-error"]').text()).toContain('Comments are unavailable.')
    expect(wrapper.find('.comment-ledger').exists()).toBe(true)
    expect(api.apiErrorMessage).toHaveBeenCalledWith(expect.anything(), '无法加载评论。')
  })

  it('keeps populated rows, actions, and pagination visible while refreshing', () => {
    setupList({ pending: true, rows: [commentView()] })
    const wrapper = mountView()

    expect(wrapper.find('.comment-moderation__loading').exists()).toBe(false)
    expect(wrapper.find('.comment-ledger').exists()).toBe(true)
    expect(wrapper.find('[data-test="comment-approve-comment-1"]').exists()).toBe(true)
    expect(wrapper.find('.comment-pagination').exists()).toBe(true)
  })

  it('keeps stale rows, actions, and pagination when synchronization failed', () => {
    setupList({
      error: { data: { error: { message: 'Unable to read this page.' } } },
      rows: [commentView()]
    })
    const wrapper = mountView()

    expect(wrapper.get('[data-test="comment-sync-error"]').text()).toContain('Unable to read this page.')
    expect(wrapper.find('.comment-ledger').exists()).toBe(true)
    expect(wrapper.find('[data-test="comment-delete-comment-1"]').exists()).toBe(true)
    expect(wrapper.find('.comment-pagination').exists()).toBe(true)
  })

  it('refreshes the list and both keyed metrics after moderation', async () => {
    const list = setupList()
    api.moderateComment.mockResolvedValue({ data: commentView({ status: 'approved' }), meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-approve-comment-1"]').trigger('click')
    await flushPromises()

    expect(api.moderateComment).toHaveBeenCalledWith('comment-1', 'approved')
    expect(list.refresh).toHaveBeenCalledTimes(1)
    expect(refreshNuxtData).toHaveBeenCalledWith(['admin-comment-counts', 'admin-dashboard-metrics'])
  })

  it('runs automatic moderation for one row and reports the safe summary', async () => {
    const list = setupList()
    api.autoModerateComments.mockResolvedValue({
      data: {
        results: [{ id: 'comment-1', outcome: 'approved', status: 'approved' }],
        summary: { requested: 1, succeeded: 1, failed: 0 }
      },
      meta: {}
    })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-auto-moderate-comment-1"]').trigger('click')
    await flushPromises()

    expect(api.autoModerateComments).toHaveBeenCalledWith(['comment-1'])
    expect(wrapper.get('[data-test="comment-action-notice"]').text()).toContain('成功 1 条，未处理 0 条')
    expect(list.refresh).toHaveBeenCalledTimes(1)
  })

  it('automatically moderates selected rows as one bounded batch', async () => {
    setupList({ rows: [commentView(), commentView({ id: 'comment-2' })], total: 2 })
    api.autoModerateComments.mockResolvedValue({
      data: {
        results: [
          { id: 'comment-1', outcome: 'approved', status: 'approved' },
          { id: 'comment-2', outcome: 'failed', status: 'pending' }
        ],
        summary: { requested: 2, succeeded: 1, failed: 1 }
      },
      meta: {}
    })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-select-page"]').setValue(true)
    await wrapper.get('[data-test="comment-auto-moderate-selected"]').trigger('click')
    await flushPromises()

    expect(api.autoModerateComments).toHaveBeenCalledWith(['comment-1', 'comment-2'])
    expect(wrapper.get('[data-test="comment-action-notice"]').text()).toContain('成功 1 条，未处理 1 条')
    expect(wrapper.get('[data-test="comment-auto-moderate-selected"]').attributes('disabled')).toBeUndefined()
  })

  it('preserves twenty-item selection by sending D1-safe requests of at most eight comments', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => commentView({ id: `comment-${index + 1}` }))
    setupList({ rows, total: rows.length })
    api.autoModerateComments.mockResolvedValueOnce({
      data: {
        results: rows.slice(0, 8).map((row) => ({ id: row.id, outcome: 'approved' as const, status: 'approved' as const })),
        summary: { requested: 8, succeeded: 8, failed: 0 }
      },
      meta: {}
    }).mockResolvedValueOnce({
      data: {
        results: rows.slice(8).map((row) => ({ id: row.id, outcome: 'failed' as const, status: 'pending' as const })),
        summary: { requested: 2, succeeded: 0, failed: 2 }
      },
      meta: {}
    })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-select-page"]').setValue(true)
    await wrapper.get('[data-test="comment-auto-moderate-selected"]').trigger('click')
    await flushPromises()

    expect(api.autoModerateComments).toHaveBeenNthCalledWith(1, rows.slice(0, 8).map((row) => row.id))
    expect(api.autoModerateComments).toHaveBeenNthCalledWith(2, rows.slice(8).map((row) => row.id))
    expect(wrapper.get('[data-test="comment-action-notice"]').text()).toContain('成功 8 条，未处理 2 条')
    expect(wrapper.text()).toContain('最多选择 20 条；系统每 8 条安全分批处理')
  })

  it('keeps unsent selections and reports partial progress when a later batch fails', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => commentView({ id: `comment-${index + 1}` }))
    setupList({ rows, total: rows.length })
    api.autoModerateComments.mockResolvedValueOnce({
      data: {
        results: rows.slice(0, 8).map((row) => ({ id: row.id, outcome: 'approved' as const, status: 'approved' as const })),
        summary: { requested: 8, succeeded: 8, failed: 0 }
      },
      meta: {}
    }).mockRejectedValueOnce({ data: { error: { message: 'Second batch failed.' } } })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-select-page"]').setValue(true)
    await wrapper.get('[data-test="comment-auto-moderate-selected"]').trigger('click')
    await flushPromises()

    expect(api.autoModerateComments).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-test="comment-action-error"]').text())
      .toContain('已完成 8 条，剩余 2 条尚未发送。 Second batch failed.')
    expect(wrapper.text()).toContain('已选择 2 条')
  })

  it('starts the keyed metric refresh even when filling an emptied page rejects', async () => {
    const list = setupList()
    list.refresh.mockRejectedValue(new Error('list refresh failed'))
    api.moderateComment.mockResolvedValue({ data: commentView({ status: 'approved' }), meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-approve-comment-1"]').trigger('click')
    await flushPromises()

    expect(list.refresh).toHaveBeenCalledTimes(1)
    expect(refreshNuxtData).toHaveBeenCalledWith(['admin-comment-counts', 'admin-dashboard-metrics'])
  })

  it('compensates the next offset when authoritative synchronization fails', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => commentView({ id: `comment-${index + 1}` }))
    const list = setupList({ rows, total: 25 })
    list.refresh.mockRejectedValue(new Error('list refresh failed'))
    api.moderateComment.mockResolvedValue({ data: { id: 'comment-1', status: 'approved' }, meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-approve-comment-1"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-test="comment-page-next"]').trigger('click')

    expect(list.query.offset).toBe(19)
  })

  it('clamps the offset when moderation empties the last page', async () => {
    const list = setupList({ total: 41 })
    list.refresh.mockImplementation(async () => {
      list.data.value = { data: [], meta: { total: 40, offset: 40, limit: 20 } }
    })
    api.moderateComment.mockResolvedValue({ data: commentView({ status: 'approved' }), meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-page-next"]').trigger('click')
    await wrapper.get('[data-test="comment-page-next"]').trigger('click')
    expect(list.query.offset).toBe(40)

    await wrapper.get('[data-test="comment-approve-comment-1"]').trigger('click')
    await flushPromises()

    expect(list.query.offset).toBe(20)
  })

  it('surfaces action errors with an action-specific fallback', async () => {
    setupList()
    api.moderateComment.mockRejectedValue(new Error('network'))
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-reject-comment-1"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="comment-action-error"]').text()).toContain('无法拒绝该评论。')
  })

  it('confirms only deletion and removes a confirmed delete locally', async () => {
    const list = setupList()
    api.deleteComment.mockResolvedValue({ data: { id: 'comment-1' }, meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-delete-comment-1"]').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(api.deleteComment).toHaveBeenCalledWith('comment-1')
    expect(list.data.value.data).toHaveLength(0)
    expect(list.refresh).toHaveBeenCalledTimes(1)
  })

  it('manually approves selected comments and updates the pending list locally', async () => {
    const list = setupList({ rows: [commentView(), commentView({ id: 'comment-2' })], total: 2 })
    api.moderateComment.mockResolvedValue({ data: { id: 'comment-1', status: 'approved' }, meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-select-page"]').setValue(true)
    await wrapper.get('[data-test="comment-approve-selected"]').trigger('click')
    await flushPromises()

    expect(api.moderateComment).toHaveBeenNthCalledWith(1, 'comment-1', 'approved')
    expect(api.moderateComment).toHaveBeenNthCalledWith(2, 'comment-2', 'approved')
    expect(list.data.value.data).toHaveLength(0)
    expect(wrapper.get('[data-test="comment-action-notice"]').text()).toContain('成功 2 条，失败 0 条')
  })

  it('refreshes a partially changed page so offset pagination cannot skip shifted rows', async () => {
    const rows = Array.from({ length: 20 }, (_, index) => commentView({ id: `comment-${index + 1}` }))
    const list = setupList({ rows, total: 25 })
    api.moderateComment.mockResolvedValue({ data: { id: 'comment-1', status: 'approved' }, meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-approve-comment-1"]').trigger('click')
    await flushPromises()

    expect(list.refresh).toHaveBeenCalledTimes(1)
    expect(list.query.offset).toBe(0)
  })

  it('keeps failed manual moderation items selected for retry', async () => {
    setupList({ rows: [commentView(), commentView({ id: 'comment-2' })], total: 2 })
    api.moderateComment.mockResolvedValueOnce({ data: { id: 'comment-1', status: 'rejected' }, meta: {} })
      .mockRejectedValueOnce(new Error('network'))
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-select-page"]').setValue(true)
    await wrapper.get('[data-test="comment-reject-selected"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('已选择 1 条')
    expect(wrapper.get('[data-test="comment-action-notice"]').text()).toContain('成功 1 条，失败 1 条')
  })

  it('locks filtering and pagination while a manual batch is running', async () => {
    setupList({ rows: [commentView()], total: 45 })
    let resolveBatch!: () => void
    api.moderateComment.mockImplementationOnce(() => new Promise<void>((resolve) => { resolveBatch = resolve }))
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-select-comment-1"]').setValue(true)
    await wrapper.get('[data-test="comment-approve-selected"]').trigger('click')

    expect(wrapper.get('[data-test="comment-filter-all"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-test="comment-page-next"]').attributes('disabled')).toBeDefined()

    resolveBatch()
    await flushPromises()
  })

  it('queues another row action while keeping server mutations serial', async () => {
    setupList({ rows: [commentView(), commentView({ id: 'comment-2' })], total: 2 })
    let resolveFirst!: () => void
    api.moderateComment
      .mockImplementationOnce(() => new Promise<void>((resolve) => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ data: { id: 'comment-2', status: 'rejected' }, meta: {} })
    const wrapper = mountView()

    await wrapper.get('[data-test="comment-approve-comment-1"]').trigger('click')
    expect(wrapper.get('[data-test="comment-reject-comment-2"]').attributes('disabled')).toBeUndefined()
    await wrapper.get('[data-test="comment-reject-comment-2"]').trigger('click')
    expect(api.moderateComment).toHaveBeenCalledTimes(1)

    resolveFirst()
    await flushPromises()
    expect(api.moderateComment).toHaveBeenNthCalledWith(2, 'comment-2', 'rejected')
  })
})
