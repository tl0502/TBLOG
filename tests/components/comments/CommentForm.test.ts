import { mount } from '@vue/test-utils'
import CommentForm from '../../../components/comments/CommentForm.vue'

function mountForm(submitting = false, turnstileSiteKey?: string) {
  return mount(CommentForm, {
    props: { submitting, turnstileSiteKey },
    global: {
      stubs: {
        TurnstileWidget: {
          template: '<button type="button" data-test="turnstile-stub" @click="$emit(\'verified\', \'verified-token\')">verify</button>'
        }
      }
    }
  })
}

async function fillForm(
  wrapper: ReturnType<typeof mountForm>,
  values: { nickname?: string; email?: string; content?: string } = {}
) {
  await wrapper.get('[data-test="comment-nickname"]').setValue(values.nickname ?? 'Reader')
  await wrapper.get('[data-test="comment-email"]').setValue(values.email ?? 'reader@example.com')
  await wrapper.get('[data-test="comment-content"]').setValue(values.content ?? 'A thoughtful note.')
}

describe('CommentForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('emits trimmed visitor fields on submit', async () => {
    const wrapper = mountForm()
    await fillForm(wrapper, {
      nickname: '  Reader  ',
      email: '  reader@example.com  ',
      content: '  A thoughtful note.  '
    })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toEqual([[
      {
        nickname: 'Reader',
        email: 'reader@example.com',
        content: 'A thoughtful note.'
      }
    ]])
  })

  it('does not emit when trimmed required fields are empty', async () => {
    const wrapper = mountForm()
    await fillForm(wrapper, { nickname: '   ', content: '\n  \t' })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')).toBeUndefined()
  })

  it('emits a blank email as undefined', async () => {
    const wrapper = mountForm()
    await fillForm(wrapper, { email: '   ' })

    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toEqual({
      nickname: 'Reader',
      email: undefined,
      content: 'A thoughtful note.'
    })
  })

  it('declares the public API boundary constraints on its fields', () => {
    const wrapper = mountForm()
    const nickname = wrapper.get('[data-test="comment-nickname"]')
    const email = wrapper.get('[data-test="comment-email"]')
    const content = wrapper.get('[data-test="comment-content"]')

    expect(nickname.attributes()).toMatchObject({ required: '', maxlength: '80' })
    expect(email.attributes()).toMatchObject({ type: 'email', maxlength: '254' })
    expect(content.attributes()).toMatchObject({ required: '', maxlength: '5000' })
  })

  it('disables the submit button and changes its label while submitting', () => {
    const wrapper = mountForm(true)
    const button = wrapper.get<HTMLButtonElement>('[data-test="comment-submit"]')

    expect(button.element.disabled).toBe(true)
    expect(button.text()).toBe('提交中…')
  })

  it('does not call the public API directly', async () => {
    const request = vi.fn()
    vi.stubGlobal('$fetch', request)
    const wrapper = mountForm()
    await fillForm(wrapper)

    await wrapper.get('form').trigger('submit')

    expect(request).not.toHaveBeenCalled()
  })

  it('requires and submits the Turnstile token when a site key is projected', async () => {
    const wrapper = mountForm(false, 'site-key')
    await fillForm(wrapper)
    expect(wrapper.get<HTMLButtonElement>('[data-test="comment-submit"]').element.disabled).toBe(true)

    await wrapper.get('[data-test="turnstile-stub"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.emitted('submit')?.[0]?.[0]).toMatchObject({ protectionToken: 'verified-token' })
    expect(wrapper.get<HTMLButtonElement>('[data-test="comment-submit"]').element.disabled).toBe(true)
  })
})
