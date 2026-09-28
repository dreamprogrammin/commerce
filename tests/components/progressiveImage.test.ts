import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, onBeforeUnmount, toRef } from 'vue'

/**
 * Крутилка и пульсация заглушки — только пока файл действительно грузится.
 *
 * У ленивой картинки до подлёта к экрану `src` пуст, и `load` не наступит,
 * пока к ней не долистают. Раньше `animate-spin` и `animate-pulse` всё это
 * время работали: 28 сентября 2026 на карточке товара 14 таких анимаций ниже
 * первого экрана, на главной 4, и главный поток пересчитывал их стили на
 * каждом кадре — 300–330 мс за 5 секунд простоя при CPU ×4. Размытая подложка
 * при этом нужна и остаётся — она просто не анимируется.
 */

Object.assign(globalThis, { toRef, onBeforeUnmount })
vi.stubGlobal('useRuntimeConfig', () => ({
  public: { supabase: { url: 'https://example.supabase.co' } },
}))

class FakeObserver {
  static last: FakeObserver | null = null
  constructor(public callback: (entries: { isIntersecting: boolean }[]) => void) {
    FakeObserver.last = this
  }

  observe() {}
  disconnect() {}
}
globalThis.IntersectionObserver = FakeObserver as never

const SRC = 'https://example.com/product.webp'
const BLUR = 'data:image/webp;base64,AAAA'

async function mountImage(props: Record<string, unknown>) {
  const { default: ProgressiveImage } = await import('@/components/global/ProgressiveImage.vue')
  const wrapper = mount(ProgressiveImage, { props: { alt: 'Игрушка', ...props } })
  await flushPromises()
  await nextTick()
  return wrapper
}

async function comeIntoView() {
  FakeObserver.last!.callback([{ isIntersecting: true }])
  await nextTick()
}

const spinners = (w: Awaited<ReturnType<typeof mountImage>>) => w.findAll('.animate-spin').length
const pulses = (w: Awaited<ReturnType<typeof mountImage>>) => w.findAll('.animate-pulse').length

describe('картинка с заглушкой: анимация', () => {
  beforeEach(() => {
    FakeObserver.last = null
  })

  it('ленивая картинка вдали от экрана: размытая подложка есть, анимаций нет', async () => {
    const w = await mountImage({ src: SRC, blurDataUrl: BLUR })
    expect(w.find(`img[src="${BLUR}"]`).exists()).toBe(true)
    expect(spinners(w)).toBe(0)
    expect(pulses(w)).toBe(0)
  })

  it('подлетела к экрану и грузится — крутилка появляется', async () => {
    const w = await mountImage({ src: SRC, blurDataUrl: BLUR })
    await comeIntoView()
    expect(spinners(w)).toBe(1)
  })

  it('картинка первого экрана (eager) крутится сразу, пока грузится', async () => {
    const w = await mountImage({ src: SRC, blurDataUrl: BLUR, eager: true })
    expect(spinners(w)).toBe(1)
  })

  it('shimmer и запасной градиент без размытия: вдали — без пульса, у экрана — с пульсом', async () => {
    for (const props of [{ src: SRC, placeholderType: 'shimmer' }, { src: SRC }]) {
      const w = await mountImage(props)
      expect(pulses(w), JSON.stringify(props)).toBe(0)
      expect(spinners(w), JSON.stringify(props)).toBe(0)
      await comeIntoView()
      expect(pulses(w), JSON.stringify(props)).toBe(1)
      expect(spinners(w), JSON.stringify(props)).toBe(1)
    }
  })

  it('загрузилась — заглушки нет вовсе', async () => {
    const w = await mountImage({ src: SRC, blurDataUrl: BLUR, eager: true })
    await w.find('picture img').trigger('load')
    expect(spinners(w)).toBe(0)
    expect(w.find(`img[src="${BLUR}"]`).exists()).toBe(false)
  })
})
