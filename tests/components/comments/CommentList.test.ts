import { mount } from '@vue/test-utils'
import CommentList from '../../../components/comments/CommentList.vue'
import type { PublicCommentView } from '../../../types/public-view'

const comments: PublicCommentView[] = [
  {
    id: 'comment-1',
    nickname: 'First reader',
    content: 'First note',
    createdAt: '2026-07-01T08:00:00.000Z',
    replies: [{ id: 'reply-1', parentCommentId: 'comment-1', replyToNickname: 'First reader', nickname: 'Reply reader', content: 'A reply', createdAt: '2026-07-01T09:00:00.000Z' }]
  },
  {
    id: 'comment-2',
    nickname: 'Second reader',
    content: 'Second note',
    createdAt: '2026-07-02T09:30:00.000Z',
    replies: []
  }
]

describe('CommentList', () => {
  it('shows a quiet empty state when there are no approved comments', () => {
    const wrapper = mount(CommentList, { props: { comments: [] } })

    expect(wrapper.text()).toContain('暂无评论')
  })

  it('preserves the API-provided chronological order with nickname and date', () => {
    const wrapper = mount(CommentList, { props: { comments } })
    const items = wrapper.findAll('.comment-list__item')

    expect(items).toHaveLength(2)
    expect(wrapper.findAll('.comment-list__avatar').map((avatar) => avatar.text())).toEqual(['F', 'R', 'S'])
    expect(items[0]?.text()).toContain('First reader')
    expect(items[0]?.text()).toContain('2026年7月1日')
    expect(items[1]?.text()).toContain('Second reader')
    expect(items[1]?.text()).toContain('2026年7月2日')
    expect(items[0]?.text()).toContain('Reply reader')
  })

  it('renders malicious markup as escaped text without creating an image element', () => {
    const content = '<img src=x onerror="alert(1)">'
    const wrapper = mount(CommentList, {
      props: {
        comments: [{ ...comments[0]!, content }]
      }
    })

    expect(wrapper.get('.comment-list__content').text()).toBe(content)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('uses the line-preserving content class and never renders a private email field', () => {
    const commentsWithPrivateData: Array<PublicCommentView & { email: string }> = [
      { ...comments[0]!, email: 'private@example.com', content: 'Line one\nLine two' }
    ]
    const wrapper = mount(CommentList, { props: { comments: commentsWithPrivateData } })

    expect(wrapper.get('.comment-list__content').classes()).toContain('comment-list__content')
    expect(wrapper.get('.comment-list__content').text()).toBe('Line one\nLine two')
    expect(wrapper.text()).not.toContain('private@example.com')
  })

  it('identifies reply targets and collapses reply groups after the first three', async () => {
    const replies = Array.from({ length: 5 }, (_, index) => ({
      id: `reply-${index + 1}`,
      parentCommentId: 'comment-1',
      replyToNickname: index === 0 ? 'First reader' : `Reply reader ${index}`,
      nickname: `Reply reader ${index + 1}`,
      content: `Reply ${index + 1}`,
      createdAt: `2026-07-01T0${index + 1}:00:00.000Z`
    }))
    const wrapper = mount(CommentList, { props: { comments: [{ ...comments[0]!, replies }] } })

    expect(wrapper.findAll('.comment-list__reply-item')).toHaveLength(3)
    expect(wrapper.text()).toContain('回复 @First reader')
    expect(wrapper.get('.comment-list__replies-toggle').text()).toContain('2')

    await wrapper.get('.comment-list__replies-toggle').trigger('click')
    expect(wrapper.findAll('.comment-list__reply-item')).toHaveLength(5)
    expect(wrapper.get('.comment-list__replies-toggle').attributes('aria-expanded')).toBe('true')
  })
})
