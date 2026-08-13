import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import Breadcrumbs from '@/components/global/Breadcrumbs.vue'

/**
 * Десктопная ветка крошек оборачивала в <NuxtLink> ВСЕ элементы, включая
 * последний — текущую страницу. На карточке товара у последней крошки href
 * не задан вовсе (`[slug].vue:205` пушит `{ id, name }` без href), поэтому
 * в разметку уходил <a> без адреса.
 *
 * Lighthouse валил на этом проверку «Links are not crawlable»: SEO 92 на
 * десктопе карточки — единственная страница из шести, где балл не 100.
 * На мобиле проверка проходила лишь потому, что крошки там скрыты
 * (`hidden lg:block`), а мобильная ветка того же компонента изначально
 * отдаёт последнюю крошку через <span>.
 *
 * Здесь монтируем, а не читаем исходник: ветка выбирается по window.innerWidth
 * в onMounted, и проверять хочется итоговый DOM, а не шаблон.
 */

const NuxtLink = {
  props: ['to'],
  template: '<a :href="to"><slot /></a>',
}

function mountAt(width: number, items: { id: string | number, name: string, href?: string }[]) {
  window.innerWidth = width
  return mount(Breadcrumbs, {
    props: { items },
    global: { stubs: { NuxtLink } },
  })
}

/** Крошки карточки товара: у последней (сам товар) href отсутствует. */
const productCrumbs = [
  { id: 'c1', name: 'Игрушки', href: '/catalog/toys' },
  { id: 'c2', name: 'Конструкторы', href: '/catalog/toys/constructors' },
  { id: 'p1', name: 'LEGO City 60355' },
]

describe('крошки, десктопная ветка', () => {
  it('последнюю крошку не делает ссылкой', async () => {
    const wrapper = mountAt(1440, productCrumbs)
    await nextTick()

    const links = wrapper.findAll('a')
    const texts = links.map(l => l.text())

    expect(texts).toContain('Игрушки')
    expect(texts).toContain('Конструкторы')
    expect(texts).not.toContain('LEGO City 60355')
  })

  it('не оставляет ни одной ссылки без адреса', async () => {
    const wrapper = mountAt(1440, productCrumbs)
    await nextTick()

    const withoutHref = wrapper.findAll('a').filter(l => !l.attributes('href'))
    expect(withoutHref).toHaveLength(0)
  })

  it('текущую страницу помечает aria-current', async () => {
    const wrapper = mountAt(1440, productCrumbs)
    await nextTick()

    expect(wrapper.get('[aria-current="page"]').text()).toBe('LEGO City 60355')
  })

  it('промежуточные крошки остаются ссылками', async () => {
    const wrapper = mountAt(1440, productCrumbs)
    await nextTick()

    const hrefs = wrapper.findAll('a').map(l => l.attributes('href'))
    expect(hrefs).toContain('/catalog/toys')
    expect(hrefs).toContain('/catalog/toys/constructors')
  })
})

describe('крошки, мобильная ветка', () => {
  it('уже отдавала последнюю крошку не ссылкой — поведение не изменилось', async () => {
    const wrapper = mountAt(375, productCrumbs)
    await nextTick()

    const texts = wrapper.findAll('a').map(l => l.text())
    expect(texts).not.toContain('LEGO City 60355')

    const withoutHref = wrapper.findAll('a').filter(l => !l.attributes('href'))
    expect(withoutHref).toHaveLength(0)
  })
})
