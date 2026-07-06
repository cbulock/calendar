import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const mockSources = ref([])
const mockAddSource = vi.fn()
const mockRemoveSource = vi.fn()
const mockToggleSource = vi.fn()
const mockUpdateSource = vi.fn()
const mockRefreshSource = vi.fn()
const mockLoadSources = vi.fn()
const mockSetTimezone = vi.fn()
const mockTimezone = ref('UTC')

const mockPlugin = {
  id: 'outlook',
  name: 'Outlook',
  description: 'Mock Outlook plugin',
  icon: '📅',
  configFields: [
    {
      key: 'icsUrl',
      label: 'Published ICS URL',
      type: 'url',
      required: true,
      placeholder: 'https://example.com/calendar.ics',
    },
    {
      key: 'calendarName',
      label: 'Display Name',
      type: 'text',
      required: false,
      placeholder: 'Work Calendar',
    },
  ],
  validateConfig(config) {
    const errors = []
    if (!config.icsUrl || !config.icsUrl.trim()) {
      errors.push('Published ICS URL is required.')
    }
    return { valid: errors.length === 0, errors }
  },
}

vi.mock('../composables/useCalendar.js', () => ({
  useCalendar: () => ({
    sources: mockSources,
    addSource: mockAddSource,
    removeSource: mockRemoveSource,
    toggleSource: mockToggleSource,
    updateSource: mockUpdateSource,
    refreshSource: mockRefreshSource,
    loadSources: mockLoadSources,
  }),
}))

vi.mock('../composables/useTimezone.js', () => ({
  useTimezone: () => ({
    timezone: mockTimezone,
    setTimezone: mockSetTimezone,
  }),
}))

vi.mock('../plugins/index.js', () => ({
  getAllPlugins: () => [mockPlugin],
}))

vi.mock('../components/PluginCard.vue', () => ({
  default: {
    name: 'PluginCard',
    template: '<div class="plugin-card-stub" />',
  },
}))

const { default: ConfigurationView } = await import('../views/ConfigurationView.vue')

describe('ConfigurationView', () => {
  beforeEach(() => {
    mockSources.value = [
      {
        id: 'source-1',
        pluginId: 'outlook',
        label: 'Work Calendar',
        enabled: true,
        config: {
          icsUrl: 'https://example.com/work.ics',
          calendarName: 'Work Calendar',
        },
      },
    ]

    mockAddSource.mockReset()
    mockRemoveSource.mockReset()
    mockToggleSource.mockReset()
    mockUpdateSource.mockReset()
    mockRefreshSource.mockReset()
    mockLoadSources.mockReset()
    mockSetTimezone.mockReset()
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        lastRefreshed: null,
        sourceCount: 1,
        errorCount: 0,
      }),
    }))
  })

  it('preloads existing source config values into the edit form', async () => {
    const wrapper = mount(ConfigurationView)
    await flushPromises()

    await wrapper.get('button[aria-label="Edit Work Calendar"]').trigger('click')

    expect(wrapper.get('#edit-source-1-icsUrl').element.value).toBe('https://example.com/work.ics')
    expect(wrapper.get('#edit-source-1-calendarName').element.value).toBe('Work Calendar')
  })

  it('shows validation errors and does not submit invalid edits', async () => {
    const wrapper = mount(ConfigurationView)
    await flushPromises()

    await wrapper.get('button[aria-label="Edit Work Calendar"]').trigger('click')
    await wrapper.get('#edit-source-1-icsUrl').setValue('')
    await wrapper.get('button[aria-label="Save Work Calendar"]').trigger('click')

    expect(mockUpdateSource).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('Published ICS URL is required.')
  })

  it('submits edited values through updateSource', async () => {
    const wrapper = mount(ConfigurationView)
    await flushPromises()

    await wrapper.get('button[aria-label="Edit Work Calendar"]').trigger('click')
    await wrapper.get('#edit-source-1-icsUrl').setValue('https://example.com/personal.ics')
    await wrapper.get('#edit-source-1-calendarName').setValue('Personal Calendar')
    await wrapper.get('button[aria-label="Save Work Calendar"]').trigger('click')

    expect(mockUpdateSource).toHaveBeenCalledWith('source-1', {
      config: {
        icsUrl: 'https://example.com/personal.ics',
        calendarName: 'Personal Calendar',
      },
      label: 'Personal Calendar',
    })
  })
})
