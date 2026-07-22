import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import HeaderParticles from '../../../components/site/HeaderParticles.vue'

interface FakeContext {
  clearRect: ReturnType<typeof vi.fn>
  beginPath: ReturnType<typeof vi.fn>
  moveTo: ReturnType<typeof vi.fn>
  lineTo: ReturnType<typeof vi.fn>
  stroke: ReturnType<typeof vi.fn>
  arc: ReturnType<typeof vi.fn>
  fill: ReturnType<typeof vi.fn>
  strokeStyle: string
  fillStyle: string
  lineWidth: number
}

function fakeContext(): FakeContext {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0
  }
}

function stubMatchMedia(reduced: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => ({
    matches: reduced && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => false)
  }) as never)
}

// The canvas 2D context is not implemented in happy-dom, so getContext must be stubbed for the
// component's animation setup to run at all.
function stubCanvasContext(ctx: FakeContext) {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    configurable: true,
    writable: true,
    value: vi.fn(() => ctx)
  })
}

describe('HeaderParticles', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the canvas and exposes the muted scroll state', () => {
    const wrapper = mount(HeaderParticles, { props: { muted: true, theme: 'nocturne' } })

    expect(wrapper.get('canvas').attributes('aria-hidden')).toBe('true')
    expect(wrapper.get('canvas').classes()).toContain('header-particles--muted')
    expect(wrapper.get('canvas').classes()).toContain('header-particles--nocturne')
  })

  it('redraws the static frame on theme changes without starting animation for reduced-motion users', async () => {
    const ctx = fakeContext()
    stubCanvasContext(ctx)
    stubMatchMedia(true)
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as never)

    const wrapper = mount(HeaderParticles, { attachTo: document.body })

    // A single static frame is painted, but the animation loop never starts — the reduced-motion
    // guard returns before start(), so no frame is ever requested.
    expect(ctx.clearRect).toHaveBeenCalled()
    expect(raf).not.toHaveBeenCalled()

    const initialDrawCount = ctx.clearRect.mock.calls.length
    await wrapper.setProps({ theme: 'nocturne' })

    expect(ctx.clearRect).toHaveBeenCalledTimes(initialDrawCount + 1)
    expect(raf).not.toHaveBeenCalled()
  })

  it('starts the animation loop when motion is allowed', () => {
    const ctx = fakeContext()
    stubCanvasContext(ctx)
    stubMatchMedia(false)
    // A no-op spy so start() requests exactly one frame without recursing into an infinite loop.
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1 as never)

    mount(HeaderParticles, { attachTo: document.body })

    expect(raf).toHaveBeenCalled()
  })
})
