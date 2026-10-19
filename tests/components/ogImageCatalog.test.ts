import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

/**
 * Превью ссылки на разделы, `/catalog`, `/about` и `/brands` — картинка,
 * которую видят, когда ссылку пересылают в WhatsApp или Telegram.
 *
 * До 19 октября 2026 в её нижней строке стояло «Доставка по Алматы за 1 день»
 * — срок, которого магазин не даёт (по `/terms` 1–3 рабочих дня), — и
 * «12+ товаров» с первой страницы выдачи. Из текстов «за 1 день» вычистили в
 * сентябре, а картинку текстовые стражи не читают: проверяем сам компонент.
 */
async function render(props: Record<string, unknown>) {
  const { default: Catalog } = await import('@/components/OgImage/Catalog.vue')
  return mount(Catalog, { props: { title: 'Конструкторы для мальчиков', ...props } }).text()
}

describe('превью ссылки на раздел', () => {
  it('сроки доставки — как в /terms, без «за 1 день»', async () => {
    const text = await render({ description: '19 моделей от 6 190 ₸ · LEGO, CaDA, Sluban' })
    expect(text).toContain('Доставка по Алматы 1–3 дня, по Казахстану 3–7 дней')
    expect(text).not.toMatch(/за 1 день/i)
  })

  it('число товаров не дописывается сверху «N+»', async () => {
    const text = await render({ description: '19 моделей от 6 190 ₸', productsCount: 12 })
    expect(text).toContain('19 моделей от 6 190 ₸')
    expect(text).not.toContain('12+')
  })

  it('без описания — без строки-заглушки', async () => {
    const text = await render({})
    expect(text).not.toMatch(/широкий ассортимент/i)
    expect(text).toContain('Конструкторы для мальчиков')
  })
})
