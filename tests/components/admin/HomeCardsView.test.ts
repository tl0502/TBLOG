import { flushPromises, mount } from '@vue/test-utils'
import HomeCardsView from '../../../components/admin/HomeCardsView.vue'
import type { HomeSettings } from '../../../types/settings'

const api = vi.hoisted(() => ({
  fetchSettingsDomain: vi.fn(),
  updateSettingsDomain: vi.fn(),
  settingsValidationIssues: vi.fn(() => []),
  apiErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback)
}))

vi.mock('~/composables/useAdminApi', () => api)

function settings(): HomeSettings {
  return { railCards: [
    { instanceId: 'tags-1', type: 'tags', enabled: true, size: 'normal', title: 'Tags', collapsedCount: 12 },
    { instanceId: 'build-1', type: 'build-log', enabled: true, size: 'normal', title: 'Build Log', entries: ['One'] }
  ] }
}

describe('HomeCardsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('refreshNuxtData', vi.fn().mockResolvedValue(undefined))
    api.fetchSettingsDomain.mockResolvedValue({ data: settings(), meta: { domain: 'home' } })
    api.updateSettingsDomain.mockImplementation(async (_domain: string, value: HomeSettings) => ({ data: value, meta: { domain: 'home' } }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('saves only the selected card draft while preserving another unsaved draft in the editor', async () => {
    const wrapper = mount(HomeCardsView, {
      global: {
        stubs: {
          SettingsHomeForm: {
            name: 'SettingsHomeForm',
            props: ['value', 'issues', 'savingCardId', 'savedCardId', 'unpersistedCardIds', 'locked'],
            emits: ['saveCard', 'previewCard'],
            template: '<button data-test="save-tags" @click="$emit(\'saveCard\', \'tags-1\')">save</button><button data-test="preview-tags" @click="$emit(\'previewCard\', \'tags-1\')">preview</button>'
          },
          HomeCardsStructurePanel: true,
          HomeRailCardPreview: { props: ['card'], template: '<div data-test="preview-card-stub">{{ card.type }}</div>' }
        }
      }
    })
    await flushPromises()

    const editor = wrapper.getComponent({ name: 'SettingsHomeForm' })
    const draft = editor.props('value') as HomeSettings
    draft.railCards[0]!.title = 'Draft Tags'
    draft.railCards[1]!.title = 'Unsaved Build Log'
    await wrapper.get('[data-test="save-tags"]').trigger('click')
    await flushPromises()

    expect(api.updateSettingsDomain).toHaveBeenCalledWith('home', {
      railCards: [
        expect.objectContaining({ type: 'tags', title: 'Draft Tags' }),
        expect.objectContaining({ type: 'build-log', title: 'Build Log' })
      ]
    })
    expect((editor.props('value') as HomeSettings).railCards[1]).toMatchObject({ title: 'Unsaved Build Log' })
    expect(refreshNuxtData).toHaveBeenCalledWith('public:site-config')
  })

  it('opens the selected draft in a right-side preview drawer', async () => {
    const wrapper = mount(HomeCardsView, {
      global: {
        stubs: {
          SettingsHomeForm: {
            emits: ['previewCard'],
            template: '<button data-test="preview-tags" @click="$emit(\'previewCard\', \'tags-1\')">preview</button>'
          },
          HomeCardsStructurePanel: true,
          HomeRailCardPreview: { props: ['card'], template: '<div data-test="preview-card-stub">{{ card.type }}</div>' }
        }
      }
    })
    await flushPromises()

    await wrapper.get('[data-test="preview-tags"]').trigger('click')

    expect(wrapper.find('[data-test="home-card-preview-drawer"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="preview-card-stub"]').text()).toBe('tags')
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-test="home-card-preview-drawer"]').exists()).toBe(false)
  })

  it('adds another instance when the selected type already exists', async () => {
    const wrapper = mount(HomeCardsView, {
      global: { stubs: {
        SettingsHomeForm: { name: 'SettingsHomeForm', props: ['value'], template: '<div />' },
        HomeCardsStructurePanel: { emits: ['add'], template: '<button data-test="add-tags" @click="$emit(\'add\', \'tags\')">add</button>' }
      } }
    })
    await flushPromises()

    await wrapper.get('[data-test="add-tags"]').trigger('click')

    const cards = (wrapper.getComponent({ name: 'SettingsHomeForm' }).props('value') as HomeSettings).railCards
    expect(cards.filter((card) => card.type === 'tags')).toHaveLength(2)
    expect(new Set(cards.map((card) => card.instanceId)).size).toBe(cards.length)
  })

  it('persists card membership and order without persisting existing card field drafts', async () => {
    const wrapper = mount(HomeCardsView, {
      global: {
        stubs: {
          SettingsHomeForm: { name: 'SettingsHomeForm', props: ['value'], template: '<div />' },
          HomeCardsStructurePanel: {
            props: ['cards', 'saving', 'saved', 'disabled'],
            emits: ['add', 'remove', 'move', 'save'],
            template: '<button data-test="add-navigation" @click="$emit(\'add\', \'navigation\')">add</button><button data-test="save-structure" @click="$emit(\'save\')">save</button>'
          }
        }
      }
    })
    await flushPromises()

    const editor = wrapper.getComponent({ name: 'SettingsHomeForm' })
    const draft = editor.props('value') as HomeSettings
    draft.railCards[0]!.title = 'Unsaved Tags'
    await wrapper.get('[data-test="add-navigation"]').trigger('click')
    const navigation = (editor.props('value') as HomeSettings).railCards.find((card) => card.type === 'navigation')
    if (navigation?.type === 'navigation') navigation.title = 'Unsaved Navigation'
    await wrapper.get('[data-test="save-structure"]').trigger('click')
    await flushPromises()

    expect(api.updateSettingsDomain).toHaveBeenCalledWith('home', {
      railCards: [
        expect.objectContaining({ type: 'tags', title: 'Tags' }),
        expect.objectContaining({ type: 'build-log', title: 'Build Log' }),
        expect.objectContaining({ type: 'navigation', title: 'Unsaved Navigation' })
      ]
    })
    const current = editor.props('value') as HomeSettings
    expect(current.railCards.find((card) => card.type === 'tags')).toMatchObject({ title: 'Unsaved Tags' })
    expect(current.railCards.find((card) => card.type === 'navigation')).toMatchObject({ title: 'Unsaved Navigation' })
    expect(refreshNuxtData).toHaveBeenCalledWith('public:site-config')
  })

  it('uses one shared save lock for card and structure writes', async () => {
    let resolveSave!: (value: unknown) => void
    api.updateSettingsDomain.mockReturnValueOnce(new Promise((resolve) => { resolveSave = resolve }))
    const wrapper = mount(HomeCardsView, { global: { stubs: {
      SettingsHomeForm: {
        name: 'SettingsHomeForm',
        props: ['locked'], emits: ['saveCard'],
        template: '<button data-test="save-card" @click="$emit(\'saveCard\', \'tags-1\')">save</button>'
      },
      HomeCardsStructurePanel: {
        name: 'HomeCardsStructurePanel',
        props: ['disabled'], emits: ['save'],
        template: '<button data-test="save-structure" @click="$emit(\'save\')">structure</button>'
      }
    } } })
    await flushPromises()

    await wrapper.get('[data-test="save-card"]').trigger('click')
    await wrapper.get('[data-test="save-structure"]').trigger('click')

    expect(api.updateSettingsDomain).toHaveBeenCalledTimes(1)
    expect(wrapper.getComponent({ name: 'SettingsHomeForm' }).props('locked')).toBe(true)
    expect(wrapper.getComponent({ name: 'HomeCardsStructurePanel' }).props('disabled')).toBe(true)
    resolveSave({ data: settings(), meta: { domain: 'home' } })
    await flushPromises()
  })
})
